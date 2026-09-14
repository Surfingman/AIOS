# AIOS Guardian — Architecture

## 1. System Overview

```mermaid
flowchart TB
    subgraph Frontends
        Canvas["2D Card Canvas<br/>(React + Vite)"]
        Orb["3D AI Orb<br/>(React + Three.js)"]
    end

    subgraph Backend["FastAPI Backend"]
        Intent["Intent Layer<br/>(rule-based parser)"]
        Orchestrator["Agent Orchestrator"]
        Policy["Permission Engine<br/>(parent allow-list + age policy)"]
        Registry["Capability Registry"]
        Safety["Safety Mediation Layer<br/>(link/message vetting)"]
        Memory["Context & Memory Store<br/>(session, profile, device state)"]
    end

    subgraph Capabilities["Pluggable Capabilities"]
        Calendar["calendar"]
        Search["web_search"]
        Device["device_control"]
        Files["files"]
        Health["health screening<br/>+ wellness plan"]
    end

    Canvas -- "POST /api/intent" --> Orchestrator
    Orb -- "POST /api/intent" --> Orchestrator

    Orchestrator --> Intent
    Intent --> Orchestrator
    Orchestrator --> Policy
    Policy --> Orchestrator
    Orchestrator --> Registry
    Registry --> Calendar
    Registry --> Search
    Registry --> Device
    Registry --> Files
    Registry --> Health
    Calendar --> Orchestrator
    Search --> Orchestrator
    Device --> Orchestrator
    Files --> Orchestrator
    Orchestrator --> Safety
    Safety --> Orchestrator
    Orchestrator --> Memory
    Memory --> Orchestrator
```

Every capability response is routed through the **same** Safety Mediation Layer
instance to inspect nested links and messages before returning it to a frontend.
The orchestrator also checks the incoming utterance before parsing any intents.
This protects the shell's request/result path; it is not Windows-wide enforcement.
Result inspection happens after `execute()`, so it cannot prevent side effects
already performed by a capability. Real external writes need a separate
pre-execution argument check and approval gate.

## 2. Request Sequence — Multi-Intent Decomposition

```mermaid
sequenceDiagram
    participant Child as Child (Canvas/Orb)
    participant API as FastAPI /api/intent
    participant Orch as Agent Orchestrator
    participant Parser as Intent Parser
    participant Policy as Permission Engine
    participant Cap as Capability
    participant Safety as Safety Mediation

    Child->>API: "볼륨 높여줘 그리고 내 파일 보여줘"
    API->>Orch: handle(session_id, text)
    Orch->>Safety: vet_message(text)
    Safety-->>Orch: inbound verdict
    Note over Orch,Safety: If blocked, return a safety card without parsing or executing.
    Orch->>Parser: parse(text)
    Parser-->>Orch: [Intent(device_control), Intent(files)]

    loop for each intent
        Orch->>Policy: evaluate(profile, policy, intent)
        alt not allowed
            Policy-->>Orch: PolicyDecision(allowed=false)
            Orch-->>Orch: card = "blocked", skip capability
        else allowed
            Policy-->>Orch: PolicyDecision(allowed=true)
            Orch->>Cap: execute(intent, session)
            Cap-->>Orch: card
            Orch->>Safety: vet_payload(card, session.policy)
            Safety-->>Orch: SafetyVerdict
        end
    end

    Orch-->>API: OrchestratorResponse(intents, results, orb_state)
    API-->>Child: 2 result cards in one response
```

## 3. Allow-List Enforcement (Not a Block-List)

```mermaid
flowchart LR
    Request["Intent: device_control.wifi_toggle"] --> Check{"capability in\nparent allow-list?"}
    Check -- "No" --> Blocked["No entry point in the shell.\nCard: '허용 목록에 없어요'"]
    Check -- "Yes" --> AgeGate{"age-gated action &\nchild younger than\nminimum age?"}
    AgeGate -- "Yes" --> Blocked2["Blocked: age-gated"]
    AgeGate -- "No" --> Execute["Capability executes"]
```

Because policy lives in the orchestrator (`app/policy/engine.py`) rather than in
each capability, a parent configures posture once (`PUT /api/policy/{session_id}`)
and it applies uniformly — including to capabilities registered later through the
same `CapabilityRegistry`.

## 4. Component Responsibilities

| Component | File | Responsibility |
|---|---|---|
| Intent Layer | `backend/app/intent/parser.py` | Splits an utterance into 1+ structured `Intent`s (rule-based today; swappable for an LLM later) |
| Agent Orchestrator | `backend/app/orchestrator/orchestrator.py` | Routes each intent through policy → capability → safety, in that order, before returning results |
| Capability Registry | `backend/app/capabilities/` | Pluggable "apps"; each capability only implements `execute(intent, session)` |
| Permission Engine | `backend/app/policy/engine.py` | Parent allow-list + age-gated actions, evaluated *before* execution |
| Safety Mediation Layer | `backend/app/safety/mediation.py` | Vets every inbound utterance and all nested capability URLs/messages for phishing, impersonation, urgency, transfer, credential, remote-access, domain, and URL risks |
| Context & Memory Store | `backend/app/memory/store.py` | Session-scoped profile, policy, conversation history, device state, calendar, files |
| Health Screening | `backend/app/health/service.py` | Document Intelligence OCR, measurement normalization, risk flags, and seven-day wellness cards |
| 2D Card Canvas | `frontend-canvas/` | Adaptive-card style chat canvas + parent settings panel |
| 3D AI Orb | `frontend-orb/` | Three.js orb with idle/listening/thinking/speaking face states and orbiting capability icons |

## 5. What's Deliberately Out of Scope for This Hack

- LLM-based intent parsing (current parser is rule-based; the `Intent` contract
  is designed so an LLM-backed parser is a drop-in replacement)
- Actually hosting YouTube/browser/Copilot/Office as in-shell panes
- Real OS-level device control (the `device_control` capability simulates state)
- On-device attention sensing
- Voice in/out
- Production health-data persistence, FHIR integration, provider authentication,
  and generated image/video model deployment

## 6. Proposed Cross-App Extension

The [Korean hackathon scenario](hackathon-scenario-ko.md) separates existing
capabilities in this repository and the related labs from proposed integration.
Its target flow is plan -> scoped data access -> preview -> approval -> final
policy/argument check -> adapter execution -> result receipt. This approval flow,
real calendar writes, and the Translator event adapter are not implemented here.
