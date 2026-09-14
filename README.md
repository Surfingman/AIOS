# AIOS Guardian

An approval-based AI workspace for meetings, personal wellness, safety, and
local calendar tasks. Runs on Windows as a web application, not an OS security
boundary. The original child-oriented canvas and 3D orb remain as legacy demos.

## Quick Start: Guardian Workspace

Requires Python 3.12+ and Node.js 20.19+ or 22.12+. From this folder:

```powershell
.\run.ps1
```

Installs dependencies, builds the UI, and serves everything at
`http://127.0.0.1:8035`. An occupied port is skipped automatically. Stop with
Ctrl+C. Later launches can use `.\run.ps1 -SkipInstall -SkipBuild`.
Restart after backend changes; rebuild after frontend changes.

When moving this project to another PC, exclude `backend/.venv` and
`node_modules`. Virtual environments are not portable between machines or CPU
architectures. If Python reports "Machine Type Mismatch" or "not a valid
application for this OS platform", install Python 3.12+ on the destination PC
and run `.\run.ps1 -ResetVenv`. This preserves the previous environment in a
`backend/.venv-backup-*` folder, creates a new one with the local `python`, and
reinstalls dependencies. Root `.env` settings are preserved. Do not use
`-SkipInstall` with this option.

Optional Azure settings are listed in [.env.example](.env.example). The launcher
loads a root `.env` without replacing existing environment variables. Keep keys
out of source control. AAD mode requires an authorized local Azure login; API-key
mode requires changing `AZURE_OPENAI_AUTH_MODE` from `aad` to `key`.
No AI configuration is required for the honestly labelled local/rule-based path.

### Implemented Workspace Flows

- Six responsive views: tasks, meeting/language, health, safety, memory, settings.
- Natural-language multi-action suggestions, optional browser speech input and
  speech output, focus timer, explicit draft/approval/cancel/receipt flow.
- Calendar effects are real **session-local in-memory records**, not Outlook.
  Approval checks policy, unchanged arguments, expiry, safety, and conflicts;
  repeated approval does not duplicate events.
- Consented meeting text or read-only Translator WebSocket ingestion, summaries,
  evidence-backed follow-up candidates, and own-utterance language coaching.
  Translator must be started separately at `ws://127.0.0.1:8000/ws`; starting
  Guardian does not start a microphone or the Translator application.
- Confirmed local screening workflow, or program import from AI Health Lab at
  `http://127.0.0.1:8020/api/program`. The source app must already have a program.
  Imported exercise/meal plans omit measurement fields. Suggested free times use
  only the local calendar; approved health entries use the title `개인 일정`.
- Explainable phishing checks and consented recent-transcript alerts. Guardian
  alerts remain in this session; no SMS/email/guardian push is sent.
- Granular consent, item deletion, context-labelled notes, audit events, hashed
  session token and policy PIN, and eight-hour session expiry. PIN protects
  policies in that session, not Windows or independently created sessions.

Azure text analysis requires both configuration and separate transmission
consent. OCR and browser speech services have their own data-transfer disclosures.
An external connection failure is shown as a failure, never a successful import.

### Image Generation

The image studio uses Azure FLUX.2-pro, with separate image-transmission consent
and a per-generation confirmation. Enter a prompt, choose square/landscape/portrait,
review the transmitted fields, then generate one image. Results support preview,
download and deletion. Only the latest three images are kept in session memory.
No meeting or health data is automatically attached. Video generation is excluded.

Set `AZURE_IMAGE_ENDPOINT`, `AZURE_IMAGE_MODEL=flux-2-pro`,
`AZURE_IMAGE_DEPLOYMENT` (case-sensitive deployment name) and
`AZURE_IMAGE_AUTH_MODE=aad` in the root `.env`, then restart using `run.ps1`.
The endpoint can be a resource root or the full FLUX provider URL.
AAD uses DefaultAzureCredential and the `https://ai.azure.com/.default` scope;
sign in locally with an identity authorized to invoke the resource. For key auth,
set mode to `key` and put `AZURE_IMAGE_API_KEY` in the server `.env` only.
Configuration status does not guarantee authentication or model availability.

Generation is adult-profile only, may incur charges, and is never automatically
retried. A timeout can still mean a billed provider request. Turning consent off
deletes stored results and discards in-flight results but cannot cancel provider
processing or billing. Deleting a result permits an explicitly approved new
generation; only retained successful request IDs are deduplicated. Provider
content policies apply; the local phishing detector is not a full image-safety
classifier. This remains a local hackathon prototype, not a public generation API.

### Data Lifetime

All workspace data is process memory only, lost on restart and deleted on expiry
or session deletion. Transcript deletion/consent withdrawal clears transcripts,
summaries, learning notes, task evidence and pending meeting actions. Already
approved calendar events are independent outputs: delete them in the calendar
or delete the whole session. Health withdrawal clears the imported program and
pending health actions. Downloaded receipts and source-app data are outside this
deletion boundary. Use synthetic data for the hackathon.

For the expanded Korean hackathon narrative, implementation inventory, proposed
cross-app workflows, and demo acceptance criteria, see
[the scenario improvement brief](docs/hackathon-scenario-ko.md).

## Why

A child's desktop is a collection of separate front doors (YouTube, browser,
apps), each with its own scam surface and its own parental control to
maintain. AIOS Guardian puts an **Agent Orchestrator** at the OS entry point
instead: the child expresses intent in natural language, the orchestrator
checks a parent-authored **allow-list** before anything executes, routes work
to a **pluggable capability**, and vets any outbound link through one
**Safety Mediation Layer** that covers every capability uniformly.

## What's in this repo

```
backend/            FastAPI backend: intent parsing, orchestrator, permission
                     engine, safety mediation, 4 capabilities, in-memory
                     context/memory store, health-screening ingestion and
                     wellness planning. Has a pytest suite.
frontend-canvas/     Guardian Workspace (React + Vite + TS), responsive UI,
                     native approval dialogs; original App.tsx retained.
frontend-orb/        3D AI orb (React + Vite + Three.js / react-three-fiber)
                     with idle/listening/thinking/speaking face states and
                     capability icons that orbit and spread on drag.
docs/architecture.md System diagram, sequence diagram, allow-list flow.
```

## Developer Servers

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8035
```

Run the tests:

```powershell
.\.venv\Scripts\python -m pytest -q
```

> Note: `requirements.txt` pins `fastapi==0.109.2` (not the latest) and plain
> `uvicorn` (no `[standard]` extra) — newer FastAPI pulls in `fastapi-cli`,
> which requires `uvicorn[standard]` → `httptools`, which has no prebuilt wheel
> on Windows ARM64. If you're not on ARM64 you can upgrade freely.

### 2. 2D Card Canvas

```powershell
cd frontend-canvas
npm install
npm run dev
```

Opens on `http://127.0.0.1:5175`, proxies `/api` to the backend on port 8035.

### 3. 3D AI Orb

```powershell
cd frontend-orb
npm install
npm run dev
```

Legacy demo on `http://localhost:5174`, with its original backend proxy on port
8000. It does not use the new workspace approval/session flow. Do not run that
legacy backend on the Translator port when demonstrating the new connectors.

Run the backend first, then either (or both) frontends.

## Original Legacy Demo Scenarios

- **Single intent**: `"내일 오후 3시에 축구 약속 잡아줘"` → a calendar card.
- **Multi-intent decomposition** (one sentence → multiple cards): `"볼륨 높여줘 그리고 내 파일 보여줘"`.
- **Illustrated Q&A**: `"화산은 어떻게 생겨?"` or `"수학 문제 어떻게 풀어?"` → step-by-step
  emoji cards instead of a wall of text.
- **Safety mediation blocking a scam-style result**: `"무료 선물 이벤트 검색해줘"` → the
  web_search capability produces a scam-shaped mock URL, and the Safety
  Mediation Layer blocks it before it ever reaches the child.
- **Voice/message phishing mediation**: paste or transcribe `"검찰입니다. 지금 즉시
  안전 계좌로 송금하고 인증번호를 알려주세요"` → execution stops and the shell
  shows detected signals and safe next steps. This applies to child and adult profiles.
- **Parent allow-list enforcement**: open the parent settings panel (2D
  canvas), uncheck a capability, then ask for it — the shell reports "이 기능은
  지금 사용할 수 없어요" instead of executing anything.
- **Age-gated action**: set age group to 7-9, then ask to toggle wifi — blocked
  until the profile is 10-12+.

## Health screening lab

The 2D Canvas supports a complete lab flow:

1. Select **건강검진 > 업로드** and upload a PDF, JPG, PNG, or TXT report (maximum 10 MB).
2. OCR extracts common screening measurements. Review and correct every value.
3. Enter allergies, conditions, medications, and injuries, then confirm.
4. The app creates a seven-day exercise and meal program with visual steps,
   risk flags, stop conditions, sources, and generation time.

For scanned PDF/image OCR, configure Azure AI Document Intelligence before
starting the backend:

```powershell
$env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="https://<resource>.cognitiveservices.azure.com/"
$env:AZURE_DOCUMENT_INTELLIGENCE_KEY="<lab-key>"
```

Without an Azure resource, set `$env:HEALTH_LAB_DEMO="1"` to demonstrate the
flow with sample measurements. TXT uploads are parsed locally without OCR.

Future screening-center integrations can send normalized measurements to
`POST /api/health/{session_id}/screening-data`. Provider and OCR results remain
`pending_confirmation`; the user must confirm them before a program is created.

This hackathon implementation keeps health profiles in process memory only.
Restarting the backend deletes them. The new workspace adds session tokens,
consent switches and in-memory audit records, but not production identity,
durable encrypted storage, provider authentication, or FHIR mapping.
Do not expose the backend publicly with real health data until those controls exist.

## Scam and phishing mediation

The same mediation boundary is active for child and adult profiles. It checks:

- every user utterance before intent execution;
- every nested URL and message returned by every capability, not only search cards;
- domain allow/block lists using DNS-label boundaries;
- suspicious TLDs, URL shorteners, Punycode, IP-address links, embedded credentials,
  encoded scam keywords, and hidden nested links;
- combinations of impersonation, urgency/secrecy, money transfer, authentication
  codes, personal information, and remote-control app requests.

External SMS, chat, email, or call transcripts can use:

```http
POST /api/safety/analyze
Content-Type: application/json

{"text":"transcribed message", "urls":["https://example.invalid"]}
```

The new workspace subscribes to finalized Translator events after explicit
consent and a connection request. Recent text is checked when safety consent is
enabled. Guardian does not itself capture phone calls or join Teams meetings.

The detector is a deterministic, explainable first safety layer. It reduces common
phishing paths but cannot guarantee that a site, caller, or message is safe. Production
use should add reputation feeds (Microsoft Defender/SmartScreen), tenant identity,
auditing, rate limiting, and a separately evaluated Foundry classifier. An AI model
must not be allowed to override a deterministic high-risk block.

## Remaining Integrations

Production Outlook/To Do through Graph, authenticated Teams media bots, verified
external guardian notifications, wearable/FHIR connectors, durable encrypted
storage and tenant identity are not implemented. These require permissions,
deployment and additional testing. Windows-wide policy/device enforcement is
also outside this prototype. Live Azure/Translator/Health Lab calls require
separately configured services; connector tests use controlled responses.

## Product Boundary

"AI OS" describes an agent-first experience running on Windows, not a new kernel
or a Windows security boundary. Current shell policies apply only to requests
that pass through this backend. Apps opened outside the shell, real device
control, production identity, and authenticated parental administration require
additional integration and controls. Do not claim that this prototype protects
all Windows applications or guarantees scam detection.
