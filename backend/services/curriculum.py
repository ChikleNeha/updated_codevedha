from typing import Optional

from fastapi import HTTPException

MODULES = {
    1: {"id": 1, "title": "Variables and Print",
        "topics": ["what is a variable", "naming rules", "print function", "string vs number"]},
    2: {"id": 2, "title": "Data Types",
        "topics": ["integers", "floats", "strings", "booleans", "type() function"]},
    3: {"id": 3, "title": "Conditionals",
        "topics": ["if", "else", "elif", "comparison operators", "nested conditions"]},
    4: {"id": 4, "title": "Loops",
        "topics": ["for loop", "while loop", "range()", "break and continue"]},
    5: {"id": 5, "title": "Functions",
        "topics": ["def", "parameters", "return values", "calling functions", "default parameters"]},
}


def get_module(module_id: int) -> Optional[dict]:
    return MODULES.get(module_id)


def require_module(module_id: int) -> dict:
    module = get_module(module_id)
    if not module:
        raise HTTPException(status_code=404, detail=f"Module {module_id} does not exist")
    return module
