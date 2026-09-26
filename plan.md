# AetherPact — Build Plan

## Folder Structure

```
c:\AtherPact\
├── plan.md                          ← this file
├── README.md                        ← Phase 9
├── backend/
│   ├── main.py                      ← FastAPI app entry point (Phases 1-6)
│   ├── database.py                  ← SQLite schema + seeding (Phase 2)
│   ├── models.py                    ← Pydantic request/response models
│   ├── routers/
│   │   ├── listings.py              ← POST/GET /listings (Phase 2)
│   │   ├── match.py                 ← POST /match (Phase 3)
│   │   ├── negotiate.py             ← POST /negotiate (Phase 4)
│   │   ├── laya_router.py           ← Laya advisory checks (Phase 5)
│   │   ├── audit.py                 ← POST /audit/checkin|checkout (Phase 6)
│   │   └── auth.py                  ← register/login/me (Phase 7)
│   ├── services/
│   │   ├── matcher.py               ← Sentence-transformer matching logic
│   │   ├── negotiator.py            ← ZOPA solver (pure Python)
│   │   ├── llm_service.py           ← llama-cpp-python Qwen2.5 phrasing
│   │   ├── laya_service.py          ← laya advisory wrapper
│   │   └── visual_diff.py           ← OpenCV change detection
│   ├── models_cache/                ← Local model weights (gitignored)
│   │   └── qwen2.5-0.5b-instruct-q4_k_m.gguf
│   └── requirements.txt
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx                  ← Router + AnimatePresence (Phase 7)
    │   ├── pages/
    │   │   ├── Landing.tsx          ← 3D hero + chat widget (Phase 7.1)
    │   │   ├── Login.tsx            ← Auth (Phase 7.2)
    │   │   ├── Register.tsx
    │   │   ├── ProviderPortal.tsx   ← Listing form + guardrail (Phase 7.3)
    │   │   ├── SeekerPortal.tsx     ← Search + match cards (Phase 7.4)
    │   │   └── NegotiatePage.tsx    ← Clearing price + badge (Phase 7.5)
    │   ├── components/
    │   │   ├── HeroScene.tsx        ← React Three Fiber 3D element
    │   │   ├── MatchCard.tsx
    │   │   ├── NegotiateWidget.tsx
    │   │   ├── ChatWidget.tsx
    │   │   └── SkeletonCard.tsx
    │   ├── api/
    │   │   └── client.ts            ← Axios typed API client
    │   └── store/
    │       └── auth.ts              ← JWT session store
    └── public/

## Phase → File Mapping

| Phase | What Gets Built |
|-------|----------------|
| 1 | plan.md, folder skeleton, FastAPI hello-world, blank Vite app |
| 2 | database.py, models.py, routers/listings.py, seed data |
| 3 | services/matcher.py, routers/match.py |
| 4 | services/negotiator.py, services/llm_service.py, routers/negotiate.py |
| 5 | services/laya_service.py, routers/laya_router.py, decision_flags table |
| 6 | services/visual_diff.py, routers/audit.py |
| 7 | Full frontend (all pages + components) |
| 8 | Integration pass, offline test |
| 9 | README.md |

## Open Questions / Decisions Made

- **JWT secret**: generated randomly at startup, stored in env var `AETHERPACT_SECRET` (falls back to a dev default). Not a real production concern since this is a local demo.
- **Laya pip package**: `pip install laya` — will verify availability; if unavailable will note as manual step.
- **GGUF path**: `backend/models_cache/qwen2.5-0.5b-instruct-q4_k_m.gguf`
- **Seed coordinates**: realistic lat/lon for a single city (Mumbai) so haversine scores are meaningful.
- **Image upload for audit**: multipart form upload stored as temp files on disk.
```
