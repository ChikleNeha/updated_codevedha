import ast
import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from models.schemas import CodeRunRequest, CodeRunResponse
from services.curriculum import require_module
from services.llm import LLMUnavailable, chat
from services.priority import interactive
from services.prompts import CODE_SYSTEM, EXPLAIN_SYSTEM

router = APIRouter()

TIMEOUT_SECONDS = 5
MAX_OUTPUT_CHARS = 4000
ALLOWED_IMPORTS = {"math", "random"}
BLOCKED_NAMES = {
    "open", "exec", "eval", "compile", "__import__", "input", "breakpoint", "globals", "locals",
    "vars", "getattr", "setattr", "delattr", "memoryview", "help", "exit", "quit",
}

# Runs inside the child process. It caps how much can be printed and trims the traceback to the learner's lines.
RUNNER = '''
import sys, traceback

class Stop(BaseException):
    pass

class Cap:
    def __init__(self, stream):
        self.stream = stream
        self.count = 0
    def write(self, text):
        self.count += len(text)
        if self.count > 20000:
            raise Stop()
        return self.stream.write(text)
    def flush(self):
        self.stream.flush()

sys.stdout = Cap(sys.stdout)
source = open(sys.argv[1], encoding="utf-8").read()
try:
    exec(compile(source, "<your code>", "exec"), {"__name__": "__main__"})
except Stop:
    sys.stderr.write("Output limit reached. Your program printed too much.\\n")
    sys.exit(1)
except SystemExit:
    raise
except BaseException as e:
    tb = e.__traceback__.tb_next if e.__traceback__ else None
    sys.stderr.write("".join(traceback.format_exception(type(e), e, tb)))
    sys.exit(1)
'''


def strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines)
    if text.lower().startswith("code:"):
        text = text[5:]
    return text.strip("\n")


def safety_problem(code: str) -> Optional[str]:
    """Static screen of the generated code. This lowers risk, it is not a real sandbox."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None  # let Python report the syntax error itself
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_IMPORTS:
                    return f"Importing {root} is not allowed in practice mode. You can import math or random."
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if node.level or root not in ALLOWED_IMPORTS:
                return "That import is not allowed in practice mode. You can import math or random."
        elif isinstance(node, ast.Name) and node.id in BLOCKED_NAMES:
            if node.id == "input":
                return "The input function cannot be used here, because the program runs without a keyboard."
            return f"The name {node.id} is not allowed in practice mode."
        elif isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            return "Names that start with an underscore are not allowed in practice mode."
    return None


def _run_blocking(code: str) -> tuple[int, str, str]:
    with tempfile.TemporaryDirectory(prefix="codevedha_") as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "runner.py").write_text(RUNNER, encoding="utf-8")
        (tmp_path / "user_code.py").write_text(code, encoding="utf-8")
        env = {}
        if os.environ.get("SYSTEMROOT"):  # Windows needs this to start Python at all
            env["SYSTEMROOT"] = os.environ["SYSTEMROOT"]
        args = [sys.executable, "-I", "-B", "-X", "utf8", "runner.py", "user_code.py"]
        try:
            done = subprocess.run(
                args,
                cwd=tmp,
                env=env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=TIMEOUT_SECONDS,
            )
            return done.returncode, done.stdout, done.stderr
        except subprocess.TimeoutExpired as e:
            out = e.stdout.decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
            return -1, out, f"Your code ran for more than {TIMEOUT_SECONDS} seconds and was stopped."


def _trim(text: str) -> str:
    text = text.rstrip()
    return text if len(text) <= MAX_OUTPUT_CHARS else text[:MAX_OUTPUT_CHARS] + "\n... output cut"


def _last_line(error: str) -> str:
    lines = [l for l in error.strip().splitlines() if l.strip()]
    return lines[-1] if lines else "Something went wrong."


async def _explain(code: str, error: str) -> str:
    try:
        text = await chat(
            [
                {"role": "system", "content": EXPLAIN_SYSTEM},
                {"role": "user", "content": f"Code:\n{code}\n\nError:\n{error[-600:]}"},
            ],
            temperature=0.3,
            num_predict=120,
        )
        return text.strip() or f"Python said: {_last_line(error)}"
    except LLMUnavailable:
        return f"Python said: {_last_line(error)}"


@router.post("/code/run", response_model=CodeRunResponse)
async def run_code(req: CodeRunRequest):
    async with interactive():  # background lesson writing pauses while this runs
        return await _run_code(req)


async def _run_code(req: CodeRunRequest) -> CodeRunResponse:
    module = require_module(req.current_module)

    # Step 1: spoken words to Python
    try:
        raw = await chat(
            [
                {"role": "system", "content": CODE_SYSTEM.format(
                    module_title=module["title"], topics=", ".join(module["topics"]))},
                {"role": "user", "content": f"Speaker: {req.spoken_text.strip()}\nCode:"},
            ],
            temperature=0.2,
            num_predict=300,
        )
    except LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    code = strip_fences(raw)
    if not code:
        return CodeRunResponse(
            code="", success=False,
            error="No code was produced.",
            error_explanation="I could not turn that into code. Please try describing it again.",
        )

    # safety screen
    problem = safety_problem(code)
    if problem:
        return CodeRunResponse(code=code, success=False, error=problem, error_explanation=problem)

    # Step 2: run it with a 5 second limit
    returncode, stdout, stderr = await asyncio.to_thread(_run_blocking, code)
    if returncode == 0:
        return CodeRunResponse(code=code, output=_trim(stdout), success=True)

    # Step 3: explain the error
    error = _trim(stderr or "The program stopped with an error.")
    explanation = await _explain(code, error)
    return CodeRunResponse(
        code=code, output=_trim(stdout), error=error, error_explanation=explanation, success=False
    )