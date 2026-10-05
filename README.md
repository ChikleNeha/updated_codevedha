CodeVedha, Phase 1

Requirements: Python 3.10+, Node 18+, Ollama with llama3.2 installed, and Chrome or Edge.

1. Start the model
   ollama pull llama3.2
   ollama serve

2. Backend (terminal 1)
   cd backend
   python -m venv venv
   venv\Scripts\activate          (Windows)   or   source venv/bin/activate
   pip install -r requirements.txt
   copy .env.example .env         (Windows)   or   cp .env.example .env
   uvicorn main:app --reload --port 8000

3. Frontend (terminal 2)
   cd frontend
   npm install
   npm run dev

Open http://localhost:5173 in Chrome or Edge and allow the microphone when asked.
