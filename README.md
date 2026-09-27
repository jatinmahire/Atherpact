<div align="center">

# AetherPact

**Unlock unused potential in hospitality.**

A real, working B2B marketplace where hospitality businesses — hotels, restaurants, banquet venues, caterers — rent out idle resources (commercial kitchens, banquet halls, vehicles, AV equipment) to each other, matched by a real semantic-search AI pipeline and priced by a deterministic negotiation engine.

[![Live Site](https://img.shields.io/badge/Live%20Site-aetherpact--app.surge.sh-B8925A?style=for-the-badge)](https://aetherpact-app.surge.sh)
[![Backend Health](https://img.shields.io/badge/Backend-Live%20%26%20Healthy-4F7A5B?style=for-the-badge)](https://132-226-189-161.sslip.io/health)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)

**[🚀 Try the live app →](https://aetherpact-app.surge.sh)**

</div>

---

## Live Deployment

| | |
|---|---|
| **Frontend** | [aetherpact-app.surge.sh](https://aetherpact-app.surge.sh) — Surge.sh |
| **Backend API** | [132-226-189-161.sslip.io](https://132-226-189-161.sslip.io/health) — Oracle Cloud VM, Dockerized, real HTTPS via Let's Encrypt |
| **Database** | Neon Postgres (serverless, scales to zero when idle) |
| **Auth** | Firebase Authentication (Google Sign-In + email/password) |

> The backend serves real HTTPS on its own domain (`132-226-189-161.sslip.io` — a free public hostname that resolves straight to the VM's IP, fronted by nginx with a Let's Encrypt certificate) so the deployed frontend can call it without browsers blocking the request as mixed content.

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

- Git
- Python 3.10 or 3.12
- Node.js 18+
- npm 9+

---

## Setup (from a clean machine)

### 1. Clone the project

```powershell
git clone https://github.com/jatinmahire/Atherpact.git
cd Atherpact
```

### 2. Download the AI model files (one command, one time)

All three local models (Qwen2.5-0.5B GGUF, all-MiniLM-L6-v2, Laya) are **not** stored in git —
they're ~1.3 GB combined, over GitHub's normal file-size limits. Instead they're attached to this
repo's own [GitHub Release](https://github.com/jatinmahire/Atherpact/releases/tag/models-v1) and
fetched by a small script — no Hugging Face account or manual download links needed:

```powershell
cd backend
python scripts/setup_models.py
```

This downloads straight into `backend/models_cache/` and is safe to re-run (it skips anything
already present). It uses only the Python standard library, so it works even before you've
created a virtual environment or installed any dependencies. Expect this to take a few minutes
depending on your connection — the files total about 1.3 GB.

### 3. Install backend dependencies

Use a clean Python 3.10/3.12 virtual environment (see Troubleshooting if your system Python is broken).

```powershell
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

### 4. Install frontend dependencies

```powershell
cd ..\frontend
npm install
```

---

## Model Files

All three models load straight from the local `backend/models_cache/` folder that
`scripts/setup_models.py` populates — **no Hugging Face Hub calls at runtime at all**, no
account, no rate limits, no symlink/cache quirks:

| Model | Local path | What it's for |
|---|---|---|
| `all-MiniLM-L6-v2` | `backend/models_cache/all-MiniLM-L6-v2/` | Semantic matching |
| Qwen2.5-0.5B-Instruct (GGUF, Q4_K_M) | `backend/models_cache/qwen2.5-0.5b-instruct-q4_k_m.gguf` | LLM phrasing of settled negotiations |
| Laya (`convaiinnovations/laya`, English) | `backend/models_cache/laya/` | Advisory: chat intent routing, listing flags, dispute-risk badges |

Each service falls back to downloading by name from Hugging Face if its local copy is missing
(useful if you're developing and want the latest checkpoint), but the intended path for anyone
who just cloned the repo and ran `setup_models.py` is 100% local.

> **If the Qwen GGUF is missing:** LLM phrasing falls back to a deterministic template — negotiation still works correctly, just without AI-generated wording.
> **If Laya is missing/unavailable:** all advisory checks return safe neutral defaults — the marketplace, matching, and negotiation all work without interruption.

---

## Running

### Start backend
```powershell
cd backend
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

First start takes a few seconds to load the local models into memory. No network access needed.

### Start frontend
```powershell
cd frontend
npm run dev
```

### Open in browser
- **Frontend:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

---

## Production Deployment (Addendum 8)

Live, real, and deployed — not just deployment-ready.

- **Live frontend:** [aetherpact-app.surge.sh](https://aetherpact-app.surge.sh) — Surge.sh, built with `VITE_API_BASE_URL` pointed at the real backend
- **Live backend:** [132-226-189-161.sslip.io](https://132-226-189-161.sslip.io/health) — Dockerized FastAPI on an Oracle Cloud VM, behind nginx with a real Let's Encrypt certificate
- **Database:** Neon Postgres (hosted, serverless — free tier scales compute to zero when idle, which is why the first request after a quiet period can take a few extra seconds to show `"database": "connected"`)

**How it's actually wired:**
- `backend/Dockerfile` — Python 3.12-slim + build tools for `llama-cpp-python`'s compiled step, CPU-only torch (avoids pulling multi-GB CUDA libraries), headless OpenCV (no `libGL.so.1` dependency in a slim image).
- `backend/.env.example` — every real environment variable this backend reads. (No Porter/courier integration exists in this project — there's nothing to configure for it.)
- `backend/alembic/` — a verified migration (`alembic upgrade head`) that creates all real tables from the SQLAlchemy models in `database.py`, tested against both a fresh database and the live Neon instance.
- `GET /health` — reports real per-component status (database connectivity, matching model, negotiation engine, vision pipeline, LLM phrasing, Laya) rather than a fixed string. Check it live: <https://132-226-189-161.sslip.io/health>
- The VM runs nginx as a TLS-terminating reverse proxy in front of the Dockerized app (port 8000, not exposed directly), with certbot renewing the certificate automatically. Both the OS firewall (`firewalld`) and the cloud-level security list have explicit rules for ports 80/443.
- `dist/200.html` — a copy of `index.html` published alongside the build so Surge serves the SPA correctly on a direct visit or refresh of any client-side route (`/provider`, `/audit`, etc.), not just `/`.
- Google Sign-In works on the live domain via Firebase's Authorized Domains list (`aetherpact-app.surge.sh` is registered there).

**Known, disclosed limitations of this deployment:**
- The Oracle VM instance runs on shape `VM.Standard.E5.Flex`, not the Always-Free `A1.Flex` shape (an ARM capacity error forced this at creation time) — it's most likely drawing on trial credit rather than the permanent free tier.
- `llm_phrasing` and `laya_advisory` report `unavailable` in the live health check — deterministic fallbacks are active in production rather than the full Qwen/Laya models.

---

## Demo User Journey

Try it live at **[aetherpact-app.surge.sh](https://aetherpact-app.surge.sh)** — no setup needed. Or run it locally:

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
- all-MiniLM-L6-v2 loads from `backend/models_cache/all-MiniLM-L6-v2/` (local folder, no Hugging Face Hub call)
- Qwen2.5 loads from `backend/models_cache/qwen2.5-0.5b-instruct-q4_k_m.gguf` (local file)
- Laya loads from `backend/models_cache/laya/` (local folder, no Hugging Face Hub call)

Everything is fully offline once `scripts/setup_models.py` has populated `models_cache/` once.

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
| `Failed to load model from file` (Qwen GGUF) | The download was silently truncated (common on flaky connections). Re-run `python scripts/setup_models.py` after deleting the partial file — it verifies nothing automatically, so also compare the file size to the release asset (should be ~491 MB). |
| Laya loads but every check returns neutral defaults | `laya.Agent` only exposes `.predict(state, questions)` (no `.choice()`/`.noul()` methods) — `laya_service.py` already calls the real API this way; if you see `'Agent' object has no attribute ...'` you're on a different `laya` version than 0.3.20 and its schema may have changed. |
| Laya sometimes misroutes a short/typo'd chat message | This is a real, disclosed limitation of the small `laya` checkpoint on free-text intent classification — `classify_chat_intent` in `laya_service.py` grounds the message with domain context and uses a dominance-margin rule (only blocks the search when a non-search class clearly wins) to reduce this, but it isn't perfect on every phrasing. Rephrasing as "I need/want a ___" is the most reliable pattern. |
| `[WinError 1314] A required privilege is not held by the client` | Only relevant if you deleted `models_cache/laya/` and let it re-download from Hugging Face by name — Windows blocks symlink creation without Developer Mode/admin rights. Re-run `scripts/setup_models.py` instead, which avoids the Hugging Face Hub cache entirely. |
| `FOREIGN KEY constraint failed` | Delete `aetherpact.db` and restart — fresh seed will run |
| Frontend shows `Connection refused` | Backend not yet ready — wait for "AetherPact backend ready ✓" in server log |

---

## Key Technical Decisions

- **SQLite over PostgreSQL:** Zero setup, portable, runs fine for demo scale
- **passlib + bcrypt 4.0.1:** Newer bcrypt (5.x) broke passlib's `__about__` attribute — pinned to 4.0.1
- **Seed data committed in two transactions:** SQLite FK enforcement requires the referenced User to exist before Assets can be inserted
- **LLM receives only clearing_price + terms:** Strict separation means the model cannot influence the price, which is computed purely by arithmetic first
- **Laya always advisory:** Every Laya output has a neutral fallback; the app never crashes or blocks on Laya unavailability
- **`faiss-cpu` instead of `hnswlib` for the semantic-search vector index:** `hnswlib` has no prebuilt wheel for Windows/Python 3.12 and needs a C++ compiler this dev machine doesn't have. `faiss-cpu`'s `IndexHNSWFlat` is the same HNSW algorithm with a real prebuilt wheel.

---

## Active-Learning Vision Triage (Phase 14)

The audit review UI (`/audit`) lets you mark each flagged region as **False alarm** or **Confirm change** after reviewing it. This does two things, and nothing else:

1. Crops that region's tile from the checkout photo and saves it to `backend/data/vision_triage/<false_alarm|dispute_accepted>/<audit_id>_<region_index>.jpg`.
2. Records the label on that `audit_logs` row (re-labeling a region removes its old tile from the previous label's folder, so the dataset never accumulates a stale, contradictory copy).

**This does not train anything.** It only builds the labeled dataset a future MobileNetV3 fine-tuning pass (`train_vision_classifier.py`, not yet written) would consume. The OpenCV pipeline in `services/visual_diff.py` is and remains the only thing that decides `change_detected` — triage labels never feed back into that decision.

**Don't attempt training on this data yet.** As a rough floor, don't bother running a fine-tuning pass until you have at least a few hundred labeled tiles *per class* (`false_alarm` and `dispute_accepted` each) — anything less and a MobileNetV3 head will just overfit to your specific test photos rather than learning anything that generalizes.
