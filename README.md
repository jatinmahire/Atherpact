# AetherPact

A real, working B2B marketplace where hospitality businesses (hotels, restaurants, banquet venues, caterers) rent idle resources — commercial kitchens, banquet halls, vehicles, AV equipment — to each other.

Built for a hackathon demo. Runs entirely on one local machine: no cloud APIs, no API keys, no internet dependency at judging time.

---

## Architecture

| Layer | What it does |
|-------|-------------|
| **FastAPI + SQLite** | REST API, all data persisted locally |
| **all-MiniLM-L6-v2** | Semantic matching only — never prices |
| **ZOPA solver (pure Python)** | Deterministic negotiation — no model involved |
| **Qwen2.5-0.5B-Instruct (GGUF)** | Phrases an already-computed settlement — never computes one |
| **Laya (convaiinnovations/laya)** | Advisory: intent routing, listing flags, dispute-risk badges |
| **OpenCV** | Visual change detection between check-in/check-out photos |
| **React + Vite + Tailwind + Framer Motion** | Full frontend with React Three Fiber 3D hero |

---

## Prerequisites

- Python 3.10 or 3.12
- Node.js 18+
- npm 9+

---

## Setup (from a clean machine)

### 1. Clone / copy the project

```
c:\AtherPact\
  backend\
  frontend\
```

### 2. Install backend dependencies

Use a clean Python 3.10/3.12 virtual environment (see Troubleshooting if your system Python is broken).

```powershell
cd c:\AtherPact\backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

On Windows, `llama-cpp-python` has no source build tools available on most machines (no MSVC/CMake).
If `pip install -r requirements.txt` fails while building `llama-cpp-python`, install it from the
prebuilt CPU wheel index instead, then retry the rest:

```powershell
.venv\Scripts\pip install llama-cpp-python==0.3.2 --index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
.venv\Scripts\pip install -r requirements.txt
```

### 3. Install frontend dependencies

```powershell
cd c:\AtherPact\frontend
npm install
```

---

## Model Files (pre-download before the demo)

### all-MiniLM-L6-v2 (sentence-transformers)
Downloaded automatically on first startup from HuggingFace (~90 MB).
**Pre-download:** `python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"` while online. It caches automatically.

---

### MANUAL STEP REQUIRED — Qwen2.5-0.5B-Instruct (GGUF, ~400 MB)

Download **before the live demo**, not during it:

**URL:**
```
https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

**Save to (exact path):**
```
c:\AtherPact\backend\models_cache\qwen2.5-0.5b-instruct-q4_k_m.gguf
```

Then install llama-cpp-python:
```powershell
pip install llama-cpp-python
```

> **If the file is not present:** the LLM phrasing falls back to a deterministic template — the negotiation and all other features still work correctly.

---

### MANUAL STEP REQUIRED — Laya (convaiinnovations/laya)

```powershell
pip install laya
```

On first startup, Laya downloads its checkpoint from HuggingFace. Confirm the download completed on the actual demo machine before the event.

> **If Laya is unavailable:** all advisory checks return safe neutral defaults — the marketplace, matching, and negotiation all work without interruption.

---

## Running

### Start backend
```powershell
cd c:\AtherPact\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

First start takes 30–120 seconds to download/load the sentence-transformer model.
Subsequent starts are instant (model is cached by HuggingFace).

### Start frontend
```powershell
cd c:\AtherPact\frontend
npm run dev
```

### Open in browser
- **Frontend:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

---

## Demo User Journey

1. Open http://localhost:5173
2. Click **Browse Available Resources** (no login needed for search)
3. Search for `"FSSAI-certified commercial kitchen Bandra"` with budget `15000`
4. See ranked results with real score breakdowns
5. Click **"Why this match?"** to expand semantic + price + distance scores
6. Register or log in
7. Click **Negotiate** on a result
8. Enter provider and seeker price ranges — watch the ZOPA solver compute the clearing price live
9. See the LLM-phrased confirmation (or deterministic fallback) and Laya's dispute-risk badge
10. Switch to **List Your Resource** to see the provider portal and listing form with Laya safety advisory

---

## Offline Verification

With wifi disabled:
- Backend serves all requests from SQLite (no cloud calls)
- sentence-transformer model runs from local HuggingFace cache
- Qwen2.5 runs from local GGUF file
- Laya runs from local checkpoint cache

Everything except the initial model downloads is fully offline.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `bcrypt` passlib error | `pip install bcrypt==4.0.1` |
| Port 8000 in use | Kill the process: `netstat -ano \| findstr 8000` then `taskkill /PID <pid> /F` |
| Port 5173 in use | Vite auto-tries 5174 — check the terminal output for the actual URL |
| Sentence-transformer slow first start | Normal — downloads ~90 MB model on first run |
| `ImportError: email-validator is not installed` | `pydantic`'s `EmailStr` needs it; already pinned in `requirements.txt` as `pydantic[email]` |
| `llama_cpp` fails to build (`CMake Error: CMAKE_C_COMPILER not set`) | No MSVC/CMake on this machine — install the prebuilt wheel instead: `pip install llama-cpp-python==0.3.2 --index-url https://abetlen.github.io/llama-cpp-python/whl/cpu`. LLM phrasing also has a working deterministic fallback if you skip this entirely. |
| `Failed to load model from file` (Qwen GGUF) | The download was silently truncated (common on flaky connections — `Invoke-WebRequest`/some downloaders don't error on a dropped connection). Compare the file size to the `Content-Length` header from a `curl -I` on the resolve URL, and re-download with `curl -L -C -` (resume) if it doesn't match. Expected size for `q4_k_m` is ~491 MB. |
| Laya loads but every check returns neutral defaults | `laya.Agent` only exposes `.predict(state, questions)` (no `.choice()`/`.noul()` methods) — `laya_service.py` already calls the real API this way; if you see `'Agent' object has no attribute ...` you're on an older/different `laya` version than 0.3.20 and its schema may have changed. |
| `[WinError 1314] A required privilege is not held by the client` while Laya downloads its checkpoint | Windows blocks symlink creation without Developer Mode or admin rights, and `huggingface_hub`'s fallback-to-copy path doesn't always catch it. Enable Developer Mode (Settings → Privacy & Security → For developers) or run as Administrator, then delete `%USERPROFILE%\.cache\huggingface\hub\models--convaiinnovations--laya` and restart to re-download cleanly. The app still starts and works with neutral advisory defaults if you skip this. |
| `FOREIGN KEY constraint failed` | Delete `aetherpact.db` and restart — fresh seed will run |
| Frontend shows `Connection refused` | Backend not yet ready — wait for "AetherPact backend ready ✓" in server log |

---

## Key Technical Decisions

- **SQLite over PostgreSQL:** Zero setup, portable, runs fine for demo scale
- **passlib + bcrypt 4.0.1:** Newer bcrypt (5.x) broke passlib's `__about__` attribute — pinned to 4.0.1
- **Seed data committed in two transactions:** SQLite FK enforcement requires the referenced User to exist before Assets can be inserted
- **LLM receives only clearing_price + terms:** Strict separation means the model cannot influence the price, which is computed purely by arithmetic first
- **Laya always advisory:** Every Laya output has a neutral fallback; the app never crashes or blocks on Laya unavailability
