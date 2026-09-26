# AetherPact — Build Specification and Execution Plan
### For Claude / Claude Code: read this entire document before writing any code, then execute it phase by phase, in order, without skipping ahead.

---

## 0. Read This First (instructions addressed directly to you, Claude)

This document is the complete specification for a real, working project called AetherPact. You
are being asked to build it end to end, autonomously, working through the numbered phases in
Section 3 in order. Do not wait for the human to re-explain anything already stated here. Do not
ask for confirmation between ordinary steps. Only stop and wait for the human in exactly two
situations, both described below: a Manual Step, or a genuine ambiguity you cannot resolve from
this document.

**How to work:**
- Read Sections 1 and 2 fully before touching any code. They apply to every phase.
- Work through Section 3's phases strictly in order.
- After finishing each phase, verify it yourself (run it, call it, test it) before moving to the
  next phase. Do not report a phase done until you've actually confirmed it works, not just that
  it compiles or that you wrote plausible-looking code.
- When a phase contains a block marked `MANUAL STEP REQUIRED`, stop, print that block's
  instructions clearly, and wait for the human to confirm completion before continuing that phase.
- Be concise when reporting progress. Summarize what you verified in a few lines. Do not reprint
  full file contents back after writing them.
- If you hit a genuine ambiguity this document doesn't resolve, ask one direct question and wait.
  Otherwise, make the most reasonable decision yourself and keep moving.

---

## 1. Project Overview

AetherPact is a real, working B2B marketplace where hospitality businesses (hotels, restaurants,
banquet venues, caterers) rent out idle resources (commercial kitchens, banquet halls, vehicles,
AV equipment) to each other. It is built for a hackathon demo and must run entirely on one local
machine: no cloud APIs, no API keys, no internet dependency at judging time. Everything shown on
screen must be computed live from real logic, real data, and real local models. Nothing in this
project is allowed to be faked, simulated, or hardcoded to look like it's working when it isn't,
under any time pressure, at any phase.

---

## 2. Non-Negotiable Rules (apply to every phase, no exceptions)

1. **No fabricated results.** Every score, price, ranking, or AI judgment shown anywhere in the
   UI must come from the real logic specified in this document, computed on the real input given
   at that moment. If something cannot be finished for real in the time available, cut that
   feature entirely rather than fake a smaller version of it.

2. **Strict separation of AI responsibilities.** Never blur these roles:
   - **Semantic matching** (`all-MiniLM-L6-v2`, local): decides what is relevant to a search.
     Never decides a price.
   - **ZOPA solver** (pure Python arithmetic, no model of any kind involved): decides the
     negotiated price. Nothing else is allowed to touch this number.
   - **Qwen2.5-0.5B-Instruct** (local LLM, via `llama-cpp-python`): only phrases an
     already-computed negotiation result in natural language. It is never given the original
     offer/ask/min/max numbers, only the final settled price, so it cannot influence it. It never
     computes anything and never makes a decision.
   - **Laya** (`convaiinnovations/laya`, local decision model): only answers narrow, typed
     yes/no or category questions for routing and guardrails, chatbot intent classification,
     listing red-flag warnings, negotiation dispute-risk badges. It never sets a price and never
     overrides the matching ranking. Its outputs are always advisory, never blocking.

3. **Manual Step Protocol.** Whenever a step requires the human to do something outside your own
   tool access, most commonly downloading a large model weight file, creating an account,
   generating a credential, or confirming something works on the physical machine that will run
   the live demo, stop immediately and print:

   ```
   ### MANUAL STEP REQUIRED
   [exact numbered instructions]
   ```

   Then wait for explicit confirmation before continuing. Never guess, skip, or simulate around
   a manual step.

4. **Zero-Errors Protocol.** After implementing each phase, run it yourself: start the relevant
   server, call the relevant endpoint or open the relevant page, and confirm the real behavior
   matches the specification, including edge cases explicitly called out in that phase. Fix any
   error before reporting the phase complete. A phase is not done because it compiles; it is done
   because you have verified its actual behavior.

5. **Conciseness.** Report progress briefly. State what you built, what you tested, and the
   result. Do not restate this document's content back, and do not paste full file contents into
   your responses after writing them to disk.

---

## Tech Stack

- **Backend:** Python, FastAPI, SQLite, `sentence-transformers`, `llama-cpp-python`, `laya`,
  `opencv-python`
- **Frontend:** React (Vite), TypeScript, Tailwind CSS, Framer Motion, `@react-three/fiber` and
  `@react-three/drei` for a 3D hero accent, shadcn/ui components
- **Everything runs locally:** backend on `localhost:8000`, frontend dev server on
  `localhost:5173`. No deployment is required; the live demo runs from a laptop.

## Visual Design Direction

Primary color navy `#3A4876`, accent lavender `#C7CEEA`, white or near-white background, rounded
corners, generous whitespace. Smooth page and state transitions via Framer Motion, a tasteful,
non-gimmicky 3D element in the landing page hero via React Three Fiber (a subtle rotating or
floating abstract shape is enough), skeleton loading states tied to real in-flight requests
(never a fixed fake timer unless a phase explicitly says otherwise), and small micro-interactions
on buttons and cards. Aim for polished and modern, not flashy for its own sake.

---

## 3. Build Plan, Execute These Phases In Order

### PHASE 1 — Scaffolding and Plan

Enter plan mode. Propose the full folder structure for `backend/` (FastAPI) and `frontend/`
(Vite, React, TypeScript, Tailwind), including where local model weights will be cached. Write
this plan to `plan.md`, including which phase implements which file and anything you are unsure
about. Show the plan and proceed once it's reasonable; only pause for confirmation if something
here is genuinely ambiguous.

**Definition of Done:** `plan.md` exists, the folder structure exists, a minimal FastAPI "hello
world" endpoint and a blank Vite React app both run locally without errors.

---

### PHASE 2 — Core Data Model, Listings, and Availability

Implement in `backend/`:
- SQLite schema: `users`, `assets`, `availability_windows`, `requirements`, `match_results`,
  `negotiations`, `bookings`, `audit_logs`, `ratings`, `decision_flags`, with complete, sensible
  fields for each table given this project's purpose.
- `POST /listings`, `GET /listings`, with hard conflict checking so no two confirmed bookings can
  overlap on the same asset's time window, with no exceptions.
- Seed 5 realistic hospitality listings at startup (for example a banquet hall, a commercial
  kitchen, an AV equipment set, a shuttle van fleet, a rooftop event space) so later phases have
  real data to test against.

**Definition of Done:** you have created a listing and confirmed it persists, confirmed a
conflicting booking attempt is correctly rejected, and confirmed `GET /listings` returns the real
seeded data.

---

### PHASE 3 — Real Semantic Matching

Implement `POST /match` exactly as follows:
1. Load `all-MiniLM-L6-v2` via `sentence-transformers` once at startup.
2. Embed the seeker's free-text requirement and every active listing's description.
3. Compute cosine similarity as `semantic_score`.
4. Compute `price_score = max(0, 1 - abs(listing.price - budget) / budget)` if `budget > 0`,
   otherwise `0.5`.
5. Compute `distance_score` from the haversine distance between requirement and listing
   coordinates, decayed to 0 over 10 km.
6. `final_score = 0.5*semantic_score + 0.3*price_score + 0.2*distance_score`.
7. Return the top 5 matches, sorted descending, each with its full score breakdown rounded to 3
   decimals. Never return a value not computed by this exact logic.

**Definition of Done:** two different free-text queries against the seeded listings produce two
different rankings, and changing the budget changes `price_score` and can change the ranking
order. Verify both and report the two queries and their top result each.

---

### PHASE 4 — Deterministic Negotiation With Local LLM Phrasing Only

Implement `POST /negotiate`:

1. **Policy layer**, pure Python, no model involved:
   ```
   lower_bound = max(provider_min, seeker_offer)
   upper_bound = min(provider_ask, seeker_max)
   if lower_bound > upper_bound: return status "no_deal" with an honest explanatory message
   clearing_price = round((lower_bound + upper_bound) / 2, 2)
   ```
2. **Presentation layer:** use `llama-cpp-python` to load `Qwen2.5-0.5B-Instruct` (GGUF,
   `Q4_K_M` quantization) and generate a short, 1 to 2 sentence phrasing of the already-computed
   `clearing_price` and any extra terms. The model must receive only the final settled price and
   terms text, never the original offer, ask, min, or max values.

```
### MANUAL STEP REQUIRED
Downloading the Qwen2.5-0.5B-Instruct GGUF file (roughly 400 MB) must happen once, ahead of the
live demo, not during it. When you reach this point, tell the human the exact Hugging Face URL
and the exact local path to save the file to, then wait for confirmation the file is in place
before attempting to load it.
```

**Definition of Done:** a settled negotiation returns a real `clearing_price` and a real generated
transcript sentence; a genuinely non-overlapping offer/ask pair correctly returns `no_deal`, not
a fabricated price. Verify both cases.

---

### PHASE 5 — Laya System 1 Decision Layer, Strictly Advisory

```
### MANUAL STEP REQUIRED
Loading Laya's checkpoint for the first time downloads a sizeable model file from Hugging Face.
When you reach this point, confirm with the human that this download has completed successfully
on the actual machine that will run the live demo, since a failed or partial download here would
silently break this phase later. Wait for confirmation before continuing.
```

Using `pip install laya` and `laya.load("convaiinnovations/laya")`, loaded once at startup,
implement:
1. A `choice`-type check on chatbot messages before they reach `/match`: options
   `resource_search`, `general_question`, `off_topic_or_spam`. Only `resource_search` proceeds
   to a real `/match` call; anything else gets an honest, helpful fallback response instead.
2. A `noul`-type check on new listing descriptions for a possible safety or compliance flag,
   shown to the provider as a dismissible advisory note, never a hard block on publishing.
3. A `noul`-type check on settled negotiation terms for dispute risk, shown as a small badge
   next to the real `clearing_price`, never altering that price.
Store each of these results in the `decision_flags` table.

**Definition of Done:** one clearly on-topic and one clearly off-topic chatbot message each route
correctly, and the guardrail and risk-flag checks never crash or block the listing or negotiation
flow, even when Laya's answer has low confidence.

---

### PHASE 6 — Visual Verification

Implement `POST /audit/checkin`, `POST /audit/checkout`, `GET /audit/{booking_id}`:
- Convert both images to grayscale, apply Gaussian blur, compute `cv2.absdiff`, threshold, find
  contours with `cv2.findContours`, and flag bounding boxes above a minimum area as changed
  regions. Do not use raw pixel or SSIM difference directly, since that falsely flags lighting
  differences as damage.
- Label this feature everywhere, in code comments and in UI text, as "visual change detection,"
  never as trained damage or hygiene classification, since that is not what it actually does.

**Definition of Done:** a test pair differing only in lighting produces no false flag, and a test
pair with a genuine visible object difference is correctly flagged.

---

### PHASE 7 — Full Frontend Build

Set up React, Vite, TypeScript, Tailwind, Framer Motion, `@react-three/fiber`, `@react-three/
drei`, and shadcn/ui, following Section 1's visual design direction. Build:

1. **Landing page:** hero section with a subtle rotating or floating abstract 3D element (React
   Three Fiber, low-poly or particle-based, tasteful, not gimmicky), one honest sentence about
   how matching works, "Browse Available Resources" and "List Your Resource" buttons, and a
   floating AI search chat widget wired to the real `/match` endpoint, with a loading state tied
   to the actual in-flight request, never a fixed fake timer.
2. **Auth:** real register and login against the backend, JWT stored client-side, session
   restore on page load via `GET /me`.
3. **Provider Portal:** listing form including the guardrail advisory note from Phase 5, a live
   list of the provider's own listings, a simple revenue-style summary view.
4. **Seeker Portal:** search form, ranked match result cards with animated score bars, an
   expandable "why this match?" panel (smooth height animation) showing the real insight text
   and confidence badge from the matching logic.
5. **Negotiate & Settle view:** the real `clearing_price` shown prominently, the generated
   transcript sentence, and the dispute-risk badge from Phase 5, visually separated from each
   other so it's clear which parts are deterministic and which are advisory.
6. Page and state transitions throughout via Framer Motion's `AnimatePresence`. Skeleton loading
   states for every async call, removed exactly when the real response arrives, never earlier or
   later than that.
7. Responsive down to a laptop screen at minimum.

**Definition of Done:** the full flow (register, list, search, match, negotiate, verify) runs in
a browser against the local backend with zero console errors, and every animation is tied to a
real state change rather than an arbitrary fixed timer, except where a phase explicitly allows a
short fixed-interval loading label tied to genuinely in-flight work.

---

### PHASE 8 — Integration Pass and Error Sweep

Start both servers fresh. Walk the entire user journey yourself end to end: register as provider,
list a resource, register as seeker, search, get matched, negotiate, settle, run check-in and
check-out verification, and view every badge and flag along the way. Fix anything that errors,
silently fails, or shows placeholder or lorem-ipsum content anywhere. Then confirm the entire
flow still works with the machine's wifi disabled, to prove the offline claim is actually true
rather than aspirational.

**Definition of Done:** a clean run of the full journey with wifi off, zero console errors, zero
network errors.

---

### PHASE 9 — README and Demo Runbook

Write `README.md` covering: exact setup commands from a clean machine, exactly which model files
must be pre-downloaded and from where, exact commands to start both servers, and a short
troubleshooting section based on anything that actually caused trouble while you were building
this, not a generic template.

**Definition of Done:** the human can follow `README.md` on a second, clean machine and get the
full application running without needing to ask a follow-up question.

---

## 4. When You're Done

After Phase 9, give a short overall summary: what was built, what had to be simplified or cut and
why (if anything), and a final confirmation that Section 2's five non-negotiable rules held true
across the entire build, phase by phase.
