# AIOS — AI-Native OS Concept & Prototype

> "앱(App)"이 아니라 **의도(Intent)** 를 실행 단위로 삼는 차세대 OS 개념 설계 및 동작 프로토타입.
> 해커톤 프로젝트로, 데스크톱/모바일을 아우르는 폼팩터 불가지론적 AI 에이전트 OS를 목표로 합니다.

## ✨ 개요

기존 OS는 사용자가 "앱을 실행"해서 원하는 작업을 수행합니다.
AIOS는 사용자가 자연어(또는 제스처/음성)로 **의도**를 표현하면,
내부의 **Agent Orchestrator(AI 커널)** 가 의도를 분해하고 필요한 **Capability(능력 모듈)** 들을 조합해
결과를 동적인 **카드(Card) UI** 로 보여주는 방식입니다.

이 저장소에는 다음이 포함되어 있습니다:

1. **아키텍처 개념 설계 문서** (`docs/architecture.md`) — mermaid 다이어그램 기반
2. **동작하는 Python 백엔드 프로토타입** (`src/`) — FastAPI 기반 Agent Orchestrator
3. **2D 대화형 캔버스 UI** (`ui/`) — 앱 아이콘 대신 카드가 쌓이는 채팅형 UI
4. **3D AI 오브(Orb) UI** (`ui3d/`) — Three.js 기반, 중앙의 살아있는 AI 오브를 중심으로 아이콘이 회전하며 나타나는 차세대 인터페이스

## 🏗 아키텍처

```
Adaptive UI Layer (2D 캔버스 / 3D 오브)
        ↓
Intent Layer (의도 파싱 / 분해)
        ↓
Agent Orchestrator (AI 커널: 라우팅 + 권한 검사)
        ↓
Capability Registry (구 '앱': calendar, web_search, device_control, files ...)
        ↓
Context & Memory Store (세션 / 장기 기억 / 디바이스 상태)
```

자세한 내용과 다이어그램은 [`docs/architecture.md`](docs/architecture.md) 참고.

### 기존 OS와의 차이

| 구분 | 기존 OS | AIOS |
|---|---|---|
| 실행 단위 | 프로세스 / 앱 | 의도(Intent) → Capability 조합 |
| 인터페이스 | 아이콘 / 윈도우 | 대화형 캔버스 + 3D 오브 + 동적 카드 |
| 확장 방식 | 앱 설치 | Capability 등록 / 플러그인 |
| 권한 모델 | 앱 단위 권한 | 의도 / 태스크 단위 세분화 권한 |

## 📂 프로젝트 구조

```
AIOS/
├── docs/
│   └── architecture.md     # 아키텍처 & UI 개념도 (mermaid)
├── src/                     # 백엔드 (Python / FastAPI)
│   ├── capabilities.py      # Capability 모듈 (calendar, web_search, device_control, files)
│   ├── context_store.py     # 세션 / 장기 기억 / 디바이스 상태 저장소
│   ├── orchestrator.py      # Agent Orchestrator: 의도 파싱, 슬롯 추출, 권한 검사, 라우팅
│   └── server.py            # FastAPI 서버 (API + 정적 UI 서빙)
├── ui/                      # 2D 대화형 캔버스 UI (HTML/CSS/JS)
├── ui3d/                    # 3D AI 오브 UI (Three.js)
└── requirements.txt
```

## 🚀 실행 방법

### 1. 의존성 설치

```bash
cd AIOS
python -m venv .venv

# Windows
.venv\Scripts\pip install -r requirements.txt

# macOS/Linux
.venv/bin/pip install -r requirements.txt
```

### 2. 서버 실행

```bash
cd src

# Windows
..\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8765

# macOS/Linux
../.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8765
```

### 3. 브라우저에서 확인

| URL | 설명 |
|---|---|
| http://127.0.0.1:8765/ | 2D 대화형 캔버스 UI |
| http://127.0.0.1:8765/3d/ | 3D AI 오브 UI |

## 🧪 데모 시나리오

입력창에 아래와 같은 자연어 의도를 입력해 보세요:

- `내일 오후 3시에 팀 회의 잡고, 관련 자료 찾아줘` → 📅 일정 카드 + 🔎 검색 카드 동시 생성
- `거실 조명 켜줘` → 💡 기기 제어 카드
- `보고서 파일 찾아줘` → 📁 파일 카드
- `우주여행 예약해줘` → 🤔 처리 불가 응답 (미등록 Capability)

3D 오브 UI에서는 화면을 드래그해 오브 주위의 아이콘(📅🔎💡📁⚙️🕘)을 둘러보고 클릭해서도 실행할 수 있습니다.
말풍선 입력창에 포커스하면 오브가 "듣는 중" 표정으로 바뀌고, 응답이 오면 "말하는 중" 표정으로 전환됩니다.

## 🔌 API

| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/intent` | `{ session_id, text }` → 의도를 분해/실행하고 UI 카드 목록 반환 |
| GET | `/api/state` | 현재 디바이스/컨텍스트 상태 조회 |
| GET | `/api/history/{session_id}` | 세션 대화 기록 조회 |

## 🛠 기술 스택

- **Backend**: Python, FastAPI, Pydantic
- **2D UI**: Vanilla HTML/CSS/JavaScript
- **3D UI**: Three.js (WebGL)

## 🗺 향후 계획 (Roadmap)

- [ ] 실제 LLM(예: GPT/Claude) 기반 의도 파싱으로 교체 (현재는 키워드 규칙 기반)
- [ ] Capability 플러그인 시스템 (서드파티 능력 등록 API)
- [ ] 실내 위치 기반 컨텍스트 연동 (Wi-Fi/BLE/기압계 기반 층별 위치)
- [ ] 음성 인터페이스 (STT/TTS) 연동으로 3D 오브의 실시간 리액션 강화
- [ ] 세분화된 권한 관리 UI (사용자가 Capability별 권한을 직접 승인/취소)

## 📄 라이선스

TBD

---

*이 프로젝트는 해커톤을 위한 개념 증명(Proof of Concept)이며, 실제 프로덕션 사용을 위한 것이 아닙니다.*
