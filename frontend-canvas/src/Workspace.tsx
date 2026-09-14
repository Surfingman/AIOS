import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Heart,
  History,
  ImagePlus,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  Mic,
  Plug,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { openWorkspace, workspaceApi } from "./api";
import HealthScreeningPanel from "./components/HealthScreeningPanel";
import ResultCard from "./components/ResultCard";
import ImageStudio from "./components/ImageStudio";

type View =
  "overview" | "meeting" | "health" | "safety" | "memory" | "settings" | "images";
type Task = {
  id: string;
  status: string;
  source: string;
  evidence: string;
  expires_at: string;
  fingerprint: string;
  error: string | null;
  arguments: { title: string; start: string; minutes: number; context: string };
  receipt: { event_id: string; adapter: string } | null;
};
type Candidate = {
  id: string;
  title: string;
  evidence: string;
  owner: string;
  due_text: string;
  mode: string;
};
type Segment = {
  id: string;
  text: string;
  translation: string;
  speaker: string;
  source: string;
  at: string;
};
type Verdict = {
  risk_level: string;
  reason: string;
  signals: string[];
  allowed: boolean;
};
type Snapshot = {
  session_id: string;
  age_group: string;
  consents: Record<string, boolean>;
  tasks: Task[];
  events: { id: string; title: string; start: string; minutes: number }[];
  notes: { id: string; text: string; context: string; expires_at: string }[];
  audit: { id: string; action: string; at: string }[];
  alerts: { id: string; at: string; guardian: boolean; verdict: Verdict }[];
  policy: { allowed_capabilities: string[]; blocked_domains: string[] };
  guardian_locked: boolean;
  ai_configured: boolean;
  mode: string;
  last_error: string;
  connector: { status: string; error: string };
  health_ready: boolean;
  expires_at: string;
};
type Meeting = {
  segments: Segment[];
  candidates: Candidate[];
  summary: string;
};
type Program = {
  title: string;
  days: {
    day: string;
    title: string;
    activity: string;
    duration_minutes: number;
  }[];
  origin: string;
  risk_flags: { title: string; message: string }[];
  notice: string;
  [key: string]: any;
};
const navigation = [
  { id: "overview", label: "작업 공간", icon: LayoutDashboard },
  { id: "meeting", label: "회의 & 언어", icon: MessageSquare },
  { id: "health", label: "나의 건강", icon: Heart },
  { id: "images", label: "이미지 만들기", icon: ImagePlus },
  { id: "safety", label: "안전 센터", icon: ShieldCheck },
  { id: "memory", label: "기억 & 기록", icon: BookOpen },
  { id: "settings", label: "연결 & 설정", icon: Settings2 },
] as const;
const statusLabels: Record<string, string> = {
  pending: "승인 대기",
  succeeded: "등록 완료",
  cancelled: "취소됨",
  expired: "승인 만료",
  blocked: "차단됨",
  removed: "일정 삭제됨",
};
const capabilityLabels: Record<string, string> = {
  calendar: "일정",
  health: "건강",
  files: "파일",
  web_search: "검색",
  device_control: "기기",
};
const consentLabels: Record<string, { title: string; detail: string }> = {
  images: { title: "이미지 생성 전송", detail: "입력한 설명을 Azure FLUX 모델로 전송합니다. 끄면 생성 이미지도 삭제됩니다." },
  transcript: {
    title: "회의 내용 수집",
    detail:
      "동의받은 자막을 이 세션에서 처리합니다. 끄면 수집과 이력을 지웁니다.",
  },
  ai: {
    title: "Azure AI 텍스트 전송",
    detail:
      "대화 분석·교정·질문에 필요한 텍스트를 설정된 Azure 모델로 보냅니다.",
  },
  safety: {
    title: "회의 문맥 안전 검사",
    detail:
      "최근 확정 자막에서 위험 신호를 분석합니다. 통화 자체를 제어하지 않습니다.",
  },
  health: {
    title: "개인 건강정보 처리",
    detail:
      "검진 업로드 시 OCR 전송 또는 Health Lab 프로그램 가져오기를 허용합니다.",
  },
  learning: {
    title: "본인 발화 학습",
    detail: "내가 말한 표현을 교정합니다. 저장은 별도로 선택합니다.",
  },
  guardian: {
    title: "보호자 알림함",
    detail:
      "이 세션의 위험 경고를 보호자 알림함에도 표시합니다. 외부 전송은 하지 않습니다.",
  },
};
function localTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function nextTime() {
  const date = new Date(Date.now() + 86400000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function zonedTime(value: string) {
  const offset = -new Date(value).getTimezoneOffset();
  return `${value}:00${offset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
function Mode({ value }: { value: string }) {
  return (
    <span className="mode">
      {value === "azure-ai"
        ? "Azure AI"
        : value === "sample"
          ? "샘플"
          : value === "rules"
            ? "규칙 기반"
            : value === "translator"
              ? "Translator"
              : "직접 입력"}
    </span>
  );
}
function Empty({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof CalendarDays;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty">
      <Icon size={30} strokeWidth={1.3} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export default function Workspace() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<Snapshot | null>(null);
  const [meeting, setMeeting] = useState<Meeting>({
    segments: [],
    candidates: [],
    summary: "",
  });
  const [wellness, setWellness] = useState<{
    program: Program | null;
    activity: { id: string; minutes: number; at: string }[];
  }>({ program: null, activity: [] });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<{
    text: string;
    mode: string;
    actions?: { kind: string; title: string; minutes: number }[];
  }[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [transcript, setTranscript] = useState("");
  const [speaker, setSpeaker] = useState("other");
  const [tips, setTips] = useState<
    { original: string; improved: string; reason: string }[]
  >([]);
  const [safetyText, setSafetyText] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [noteContext, setNoteContext] = useState("personal");
  const [taskFilter, setTaskFilter] = useState("all");
  const [draft, setDraft] = useState<{
    title: string;
    start: string;
    minutes: number;
    context: string;
    candidate_id?: string;
    day_index?: number;
  } | null>(null);
  const [approval, setApproval] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    label: string;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [age, setAge] = useState("adult");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [domains, setDomains] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusEnd, setFocusEnd] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [listening, setListening] = useState(false);
  const recognition = useRef<any>(null);
  const refreshSequence = useRef(0);
  const busyRef = useRef(false);

  async function refresh() {
    const sequence = ++refreshSequence.current;
    const fresh = await workspaceApi<Snapshot>();
    const [conversation, health] = await Promise.all([
      workspaceApi<Meeting>("/meeting"),
      fresh.consents.health &&
      fresh.policy.allowed_capabilities.includes("health")
        ? workspaceApi("/wellness")
        : Promise.resolve({ program: null, activity: [] }),
    ]);
    if (sequence !== refreshSequence.current) return;
    setData(fresh);
    setMeeting(conversation);
    setWellness(health);
  }
  useEffect(() => { setSlots([]); }, [draft?.day_index, draft?.start]);
  async function run(
    label: string,
    action: () => Promise<unknown>,
    success = "",
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      if (success) setNotice(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  useEffect(() => {
    let live = true;
    openWorkspace()
      .then(() => {
        if (live) return refresh();
      })
      .catch((failure) => {
        if (live) setError(String(failure));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!data || data.connector.status === "disconnected") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!busyRef.current) await refresh();
      } catch (failure) {
        if (!cancelled) setError(String(failure));
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data?.connector.status]);
  useEffect(() => {
    if (!focusEnd) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [focusEnd]);
  useEffect(() => {
    if (focusEnd && clock >= focusEnd) {
      setFocusEnd(null);
      setNotice("집중 시간이 끝났습니다. 잠시 쉬어 가세요.");
    }
  }, [clock, focusEnd]);
  useEffect(
    () => () => {
      recognition.current?.abort();
      speechSynthesis.cancel();
    },
    [],
  );
  useEffect(() => {
    if (data) {
      setCapabilities(data.policy.allowed_capabilities);
      setDomains(data.policy.blocked_domains.join("\n"));
      setAge(data.age_group);
    }
  }, [
    data?.age_group,
    data?.policy.allowed_capabilities.join(","),
    data?.policy.blocked_domains.join(","),
  ]);
  function startDraft(candidate?: Candidate) {
    setDraft({
      title: candidate?.title || "",
      start: nextTime(),
      minutes: 30,
      context: "work",
      candidate_id: candidate?.id,
    });
  }
  async function consent(name: string, enabled: boolean) {
    if (!enabled && (name === "learning" || name === "transcript")) setTips([]);
    await workspaceApi("/consent", "PUT", { name, enabled });
  }
  function dictation() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setError(
        "이 브라우저에서 음성 입력을 지원하지 않습니다. 텍스트를 입력하세요.",
      );
      return;
    }
    if (
      !confirm(
        "브라우저 음성 서비스로 음성이 전송될 수 있습니다. 음성 입력을 시작할까요?",
      )
    )
      return;
    const engine = new Recognition();
    recognition.current = engine;
    engine.lang = "ko-KR";
    engine.interimResults = false;
    engine.onresult = (event: any) =>
      setInput((current) =>
        `${current} ${event.results[0][0].transcript}`.trim(),
      );
    engine.onend = () => setListening(false);
    engine.onerror = () => {
      setListening(false);
      setError("마이크 권한 또는 음성 인식을 확인하세요.");
    };
    engine.start();
    setListening(true);
  }
  async function addSample() {
    for (const [index, text] of [
      "I will send the revised proposal by Friday.",
      "Please schedule a design review with the team next week.",
    ].entries())
      await workspaceApi("/meeting/segments", "POST", {
        event_id: `sample-${index}`,
        text,
        source: "sample",
        speaker: index === 0 ? "self" : "other",
      });
  }
  function downloadReceipt(task: Task) {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              arguments: task.arguments,
              receipt: task.receipt,
              status: task.status,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `guardian-${task.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const pending = data?.tasks.filter((task) => task.status === "pending") || [];
  const complete =
    data?.tasks.filter((task) => task.status === "succeeded") || [];
  const visibleTasks = [...(data?.tasks || [])]
    .reverse()
    .filter((task) => taskFilter === "all" || task.status === taskFilter);
  const focusSeconds = focusEnd
    ? Math.max(0, Math.ceil((focusEnd - clock) / 1000))
    : focusMinutes * 60;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setView("overview");
          }}
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          <span>
            guardian<span className="brand-sub">AI WORKSPACE</span>
          </span>
        </a>
        <div className="space-label">
          MY SPACE <span>01</span>
        </div>
        <nav aria-label="주 탐색">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "overview" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="session-indicator">
            <span className="status-dot" />
            LOCAL SESSION
          </div>
          <p>Windows 위의 AI 작업 공간</p>
          <div className="user">
            <span className="avatar">나</span>
            <div>
              <strong>
                {data?.age_group === "adult"
                  ? "개인 작업 공간"
                  : "보호자 관리 공간"}
              </strong>
              <small>세션 메모리 · 최대 8시간</small>
            </div>
            <LockKeyhole size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            나의 공간 <ChevronRight size={14} />
            <strong>
              {navigation.find((item) => item.id === view)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <span className="connection-pill">
              <span
                className={`status-dot ${data?.ai_configured && data?.consents.ai ? "" : "muted"}`}
              />
              {data?.ai_configured && data?.consents.ai
                ? "Azure AI"
                : "로컬 모드"}
            </span>
            <button
              className="icon-button"
              title="새로고침"
              aria-label="새로고침"
              disabled={!!busy}
              onClick={() => run("새로고침", refresh)}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar small">나</span>
          </div>
        </header>
        <div className="content-wrap">
          {error && (
            <div className="banner error" role="alert">
              <ShieldAlert size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="오류 닫기"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner success" role="status">
              <CheckCheck size={18} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="알림 닫기"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              <LoaderCircle className="spin" size={15} />
              {busy}
            </div>
          )}
          {!data ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              <h2>작업 공간 연결 중</h2>
              <button onClick={() => run("다시 연결", openWorkspace)}>
                다시 연결
              </button>
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {new Date()
                      .toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      })
                      .toUpperCase()}
                  </div>
                  <h1>
                    {
                      {
                        overview: "오늘의 흐름을, 가볍게.",
                        meeting: "대화를 다음 행동으로.",
                        health: "나에게 맞는 건강한 하루.",
                        images: "상상한 장면을, 한 장으로.",
                        safety: "한 번 더 확인하는 안전.",
                        memory: "기억할 것만, 필요한 만큼.",
                        settings: "연결은 신중하게, 제어는 명확하게.",
                      }[view]
                    }
                  </h1>
                </div>
                {view === "overview" && (
                  <button className="primary" onClick={() => startDraft()}>
                    <Plus size={17} />새 작업
                  </button>
                )}
              </div>
              {view === "overview" && (
                <div className="overview-grid">
                  <div className="primary-column">
                    <section className="intent-surface">
                      <div className="intent-label">
                        <Sparkles size={19} />
                        <strong>무엇을 함께 할까요?</strong>
                        <span className="private-label">
                          <LockKeyhole size={12} />
                          개인 세션
                        </span>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!input.trim()) return;
                          run("생각하고 있습니다", async () => {
                            const result = await workspaceApi("/chat", "POST", {
                              text: input,
                            });
                            setChat((current) => [...current, result]);
                            setInput("");
                          });
                        }}
                      >
                        <textarea
                          aria-label="Guardian에게 요청"
                          placeholder="회의를 정리하고, 오늘 할 일을 계획해 줘."
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
                          rows={2}
                        />
                        <div className="intent-bottom">
                          <span>내가 승인한 작업만 실행</span>
                          <div>
                            <button
                              type="button"
                              className={`icon-button ${listening ? "recording" : ""}`}
                              aria-label={
                                listening ? "음성 입력 중지" : "음성 입력"
                              }
                              title="음성 입력"
                              onClick={dictation}
                            >
                              {listening ? (
                                <Square size={17} />
                              ) : (
                                <Mic size={18} />
                              )}
                            </button>
                            <button
                              type="submit"
                              className="send-button"
                              aria-label="요청 보내기"
                              disabled={!!busy || !input.trim()}
                            >
                              <ArrowUp size={20} />
                            </button>
                          </div>
                        </div>
                      </form>
                    </section>
                    {chat.map((reply, index) => (
                      <div className="answer" key={index}>
                        <div>
                          <Sparkles size={16} />
                          <Mode value={reply.mode} />
                          <button
                            title="답변 읽기"
                            className="icon-button"
                            aria-label="답변 읽기"
                            onClick={() => {
                              speechSynthesis.cancel();
                              const utterance = new SpeechSynthesisUtterance(
                                reply.text,
                              );
                              utterance.lang = "ko-KR";
                              speechSynthesis.speak(utterance);
                            }}
                          >
                            <Volume2 size={16} />
                          </button>
                          <button
                            title="읽기 중지"
                            className="icon-button"
                            aria-label="읽기 중지"
                            onClick={() => speechSynthesis.cancel()}
                          >
                            <Square size={14} />
                          </button>
                        </div>
                        <p>{reply.text}</p>
                        <div className="toolbar">
                          {reply.actions?.map((action, actionIndex) => (
                            <button key={actionIndex} className="quiet compact" onClick={() => {
                              if (action.kind === "schedule") {
                                setDraft({ title: action.title, minutes: action.minutes, start: nextTime(), context: "work" });
                              } else if (["meeting", "health", "safety"].includes(action.kind)) {
                                setView(action.kind as View);
                              }
                            }}><ArrowRight size={14} />{action.title}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="metrics">
                      <div>
                        <span>
                          <Clock3 size={16} />
                          승인 대기
                        </span>
                        <strong>
                          {pending.length.toString().padStart(2, "0")}
                          <small>건</small>
                        </strong>
                      </div>
                      <div>
                        <span>
                          <CheckCheck size={16} />
                          등록한 작업
                        </span>
                        <strong>
                          {complete.length.toString().padStart(2, "0")}
                          <small>건</small>
                        </strong>
                      </div>
                      <div>
                        <span>
                          <ShieldCheck size={16} />
                          안전 경고
                        </span>
                        <strong>
                          {data.alerts.length.toString().padStart(2, "0")}
                          <small>건</small>
                        </strong>
                      </div>
                    </div>
                    <section>
                      <div className="section-heading">
                        <h2>나의 작업</h2>
                        <span>{data.tasks.length} TASKS</span>
                      </div>
                      <div
                        className="tabs"
                        role="tablist"
                        aria-label="작업 필터"
                      >
                        {[
                          ["all", "전체"],
                          ["pending", "승인 대기"],
                          ["succeeded", "완료"],
                        ].map(([value, label]) => (
                          <button
                            role="tab"
                            aria-selected={taskFilter === value}
                            className={taskFilter === value ? "selected" : ""}
                            key={value}
                            onClick={() => setTaskFilter(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {!visibleTasks.length ? (
                        <Empty
                          icon={CheckCheck}
                          title="아직 등록된 작업이 없어요"
                          detail="새 작업을 만들거나 회의에서 후속 작업을 가져오세요."
                        />
                      ) : (
                        <div className="task-list">
                          {visibleTasks.map((task) => (
                            <article className="task-item" key={task.id}>
                              <div className={`task-symbol ${task.status}`}>
                                <CalendarDays size={20} />
                              </div>
                              <div className="task-body">
                                <div className="task-top">
                                  <span className="task-source">
                                    {task.source === "meeting"
                                      ? "회의 후속 작업"
                                      : task.source === "health"
                                        ? "건강 일정"
                                        : "직접 만든 작업"}
                                  </span>
                                  <span className={`status-tag ${task.status}`}>
                                    {statusLabels[task.status] || task.status}
                                  </span>
                                </div>
                                <h3>{task.arguments.title}</h3>
                                <div className="task-meta">
                                  <Clock3 size={13} />
                                  {localTime(task.arguments.start)}
                                  <span>· {task.arguments.minutes}분</span>
                                  <LockKeyhole size={12} />
                                  <span>로컬 일정</span>
                                </div>
                                {task.evidence && (
                                  <details>
                                    <summary>근거 발화</summary>
                                    <blockquote>{task.evidence}</blockquote>
                                  </details>
                                )}
                                {task.error && (
                                  <p className="error-text">{task.error}</p>
                                )}
                                <div className="task-actions">
                                  {task.status === "pending" ? (
                                    <>
                                      <button
                                        className="primary compact"
                                        onClick={() => setApproval(task)}
                                        disabled={!!busy}
                                      >
                                        검토하고 승인 <ArrowRight size={14} />
                                      </button>
                                      <button
                                        className="quiet compact"
                                        disabled={!!busy}
                                        onClick={() =>
                                          run(
                                            "작업 취소",
                                            () =>
                                              workspaceApi(
                                                `/tasks/${task.id}/cancel`,
                                                "POST",
                                              ),
                                            "작업이 취소됐습니다.",
                                          )
                                        }
                                      >
                                        취소
                                      </button>
                                    </>
                                  ) : (
                                    task.receipt && (
                                      <button
                                        className="quiet compact"
                                        onClick={() => downloadReceipt(task)}
                                      >
                                        <ArrowDownToLine size={14} />
                                        실행 기록
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      <div className="section-heading">
                        <h2>연결된 일상</h2>
                        <span>YOUR CAPABILITIES</span>
                      </div>
                      <div className="feature-row">
                        <button
                          className="feature meeting-feature"
                          onClick={() => setView("meeting")}
                        >
                          <MessageSquare size={23} />
                          <strong>회의에서 다음 행동으로</strong>
                          <span>자막 · 후속 작업 · 언어 코칭</span>
                          <ArrowRight size={18} />
                        </button>
                        <button
                          className="feature health-feature"
                          onClick={() => setView("health")}
                        >
                          <Heart size={23} />
                          <strong>건강을 하루 일정으로</strong>
                          <span>검진 · 운동 · 활동 기록</span>
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <aside className="right-rail">
                    <section className="agenda">
                      <div className="section-heading">
                        <h2>다가오는 일정</h2>
                        <CalendarDays size={17} />
                      </div>
                      <div className="agenda-date">
                        <strong>{new Date().getDate()}</strong>
                        <span>
                          {new Date().toLocaleDateString("ko-KR", {
                            month: "long",
                            weekday: "long",
                          })}
                        </span>
                      </div>
                      {data.events.length ? (
                        [...data.events]
                          .sort((first, second) =>
                            first.start.localeCompare(second.start),
                          )
                          .map((event) => (
                            <div className="agenda-item" key={event.id}>
                              <span className="timeline-dot" />
                              <div>
                                <small>{localTime(event.start)}</small>
                                <strong>{event.title}</strong>
                                <span>{event.minutes}분 · 비공개</span>
                              </div>
                              <button
                                className="icon-button"
                                title="일정 삭제"
                                aria-label={`일정 삭제: ${event.title}`}
                                onClick={() =>
                                  setDeleteTarget({
                                    path: `/events/${event.id}`,
                                    label: "로컬 일정 삭제",
                                  })
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                      ) : (
                        <p className="muted-text">
                          아직 예정된 일정이 없습니다.
                        </p>
                      )}
                      <small className="footnote">
                        로컬 일정 · Outlook 미연결
                      </small>
                    </section>
                    <section className="focus">
                      <div className="section-heading">
                        <h2>집중 시간</h2>
                        <Clock3 size={17} />
                      </div>
                      <div className="focus-time">
                        {String(Math.floor(focusSeconds / 60)).padStart(2, "0")}
                        <span>:</span>
                        {String(focusSeconds % 60).padStart(2, "0")}
                      </div>
                      <label className="slider-label">
                        시간{" "}
                        <input
                          type="range"
                          min="5"
                          max="60"
                          step="5"
                          value={focusMinutes}
                          disabled={!!focusEnd}
                          onChange={(event) =>
                            setFocusMinutes(Number(event.target.value))
                          }
                        />
                        {focusMinutes}분
                      </label>
                      <button
                        className="quiet full-width"
                        onClick={() => {
                          setClock(Date.now());
                          setFocusEnd(
                            focusEnd ? null : Date.now() + focusMinutes * 60000,
                          );
                        }}
                      >
                        {focusEnd ? <Square size={14} /> : <Clock3 size={14} />}
                        {focusEnd ? "중지" : "집중 시작"}
                      </button>
                    </section>
                    <section className="boundary">
                      <ShieldCheck size={25} />
                      <h3>내 데이터의 경계</h3>
                      <p>
                        건강정보와 업무 대화는
                        <br />
                        자동으로 공유되지 않습니다.
                      </p>
                      <button onClick={() => setView("settings")}>
                        공유 범위 확인 <ArrowRight size={14} />
                      </button>
                    </section>
                  </aside>
                </div>
              )}
              {view === "images" && <ImageStudio key={data.session_id} consented={data.consents.images ?? false} adult={data.age_group === "adult"} onConsent={enabled => run("이미지 동의 변경", () => consent("images", enabled))} />}
              {view === "meeting" && (
                <div className="detail-grid">
                  <div>
                    <section className="band">
                      <div className="section-heading">
                        <h2>
                          <Radio size={18} />
                          회의 대화
                        </h2>
                        <Mode
                          value={
                            data.connector.status === "connected"
                              ? "translator"
                              : "manual"
                          }
                        />
                      </div>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={data.consents.transcript}
                          disabled={!!busy}
                          onChange={(event) =>
                            run("수집 동의 변경", () =>
                              consent("transcript", event.target.checked),
                            )
                          }
                        />
                        참가자 동의와 조직 정책을 확인했습니다.
                      </label>
                      <div className="toolbar">
                        <button
                          disabled={!!busy || !data.consents.transcript}
                          onClick={() =>
                            run("Translator 연결", () =>
                              workspaceApi("/connect/translator", "POST"),
                            )
                          }
                        >
                          <Plug size={15} />
                          Translator 연결
                        </button>
                        <button
                          disabled={
                            !!busy || data.connector.status === "disconnected"
                          }
                          onClick={() =>
                            run("연결 중지", () =>
                              workspaceApi("/connect/translator", "DELETE"),
                            )
                          }
                        >
                          <Square size={14} />
                          중지
                        </button>
                        <button
                          className="quiet"
                          disabled={!!busy || !data.consents.transcript}
                          onClick={() => run("샘플 추가", addSample)}
                        >
                          <Plus size={15} />
                          샘플 대화
                        </button>
                        <button
                          className="icon-button"
                          title="회의 기록 삭제"
                          aria-label="회의 기록 삭제"
                          onClick={() =>
                            setDeleteTarget({
                              path: "/meeting",
                              label: "회의 기록 및 대기 중인 후속 작업 삭제",
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {data.connector.error && (
                        <p className="error-text">{data.connector.error}</p>
                      )}
                      <div className="transcript-list">
                        {!meeting.segments.length ? (
                          <Empty
                            icon={MessageSquare}
                            title="회의가 시작될 준비가 됐어요"
                            detail="동의받은 대화를 입력하거나 Translator를 연결하세요."
                          />
                        ) : (
                          meeting.segments.map((segment) => (
                            <article className="transcript" key={segment.id}>
                              <span className={`speaker ${segment.speaker}`}>
                                {segment.speaker === "self" ? "나" : "상대"}
                              </span>
                              <div>
                                <div className="transcript-meta">
                                  <strong>
                                    {segment.speaker === "self"
                                      ? "내 발화"
                                      : "상대 발화"}
                                  </strong>
                                  <Mode value={segment.source} />
                                </div>
                                <p>{segment.text}</p>
                                {segment.translation && (
                                  <p className="translation">
                                    {segment.translation}
                                  </p>
                                )}
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          run("대화 추가", async () => {
                            await workspaceApi("/meeting/segments", "POST", {
                              event_id: crypto.randomUUID(),
                              text: transcript,
                              speaker,
                            });
                            setTranscript("");
                          });
                        }}
                      >
                        <label>
                          확정 발화
                          <textarea
                            value={transcript}
                            onChange={(event) =>
                              setTranscript(event.target.value)
                            }
                            placeholder="Please send the updated proposal by Friday."
                            rows={3}
                            required
                            maxLength={3000}
                          />
                        </label>
                        <div className="form-actions">
                          <select
                            aria-label="발화자"
                            value={speaker}
                            onChange={(event) => setSpeaker(event.target.value)}
                          >
                            <option value="other">상대</option>
                            <option value="self">나</option>
                          </select>
                          <button
                            disabled={
                              !!busy ||
                              !data.consents.transcript ||
                              !transcript.trim()
                            }
                          >
                            <Plus size={16} />
                            발화 추가
                          </button>
                        </div>
                      </form>
                    </section>
                    <section className="band">
                      <div className="section-heading">
                        <h2>나의 언어 코칭</h2>
                        <button
                          disabled={!!busy || !data.consents.learning}
                          onClick={() =>
                            run("본인 발화 교정", async () =>
                              setTips(
                                (await workspaceApi("/learning", "POST")).tips,
                              ),
                            )
                          }
                        >
                          <Sparkles size={15} />
                          교정 생성
                        </button>
                      </div>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={data.consents.learning}
                          disabled={!!busy}
                          onChange={(event) =>
                            run("학습 동의 변경", () =>
                              consent("learning", event.target.checked),
                            )
                          }
                        />
                        내 발화에서 학습하기
                      </label>
                      {tips.map((tip, index) => (
                        <article className="coaching-item" key={index}>
                          <p>{tip.original}</p>
                          {tip.improved && <strong>{tip.improved}</strong>}
                          <p className="muted-text">{tip.reason}</p>
                          <button
                            className="quiet compact"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                "표현 저장",
                                () =>
                                  workspaceApi("/notes", "POST", {
                                    text: `${tip.original}\n${tip.improved}\n${tip.reason}`,
                                    context: "personal",
                                    source: "learning",
                                  }),
                                "복습할 표현을 기억에 저장했습니다.",
                              )
                            }
                          >
                            <BookOpen size={14} />
                            기억하기
                          </button>
                        </article>
                      ))}
                    </section>
                  </div>
                  <aside className="detail-aside">
                    <div className="section-heading">
                      <h2>후속 작업</h2>
                      <span>{meeting.candidates.length}건</span>
                    </div>
                    <button
                      className="primary full-width"
                      disabled={!!busy || !meeting.segments.length}
                      onClick={() =>
                        run("후속 작업 분석", () =>
                          workspaceApi("/meeting/analyze", "POST"),
                        )
                      }
                    >
                      <Sparkles size={16} />
                      대화 분석
                    </button>
                    {meeting.summary && (
                      <p className="meeting-summary">{meeting.summary}</p>
                    )}
                    {data.last_error && (
                      <p className="error-text">{data.last_error}</p>
                    )}
                    {meeting.candidates.map((candidate) => (
                      <article className="candidate" key={candidate.id}>
                        <Mode value={candidate.mode} />
                        <h3>{candidate.title}</h3>
                        <p>
                          담당: {candidate.owner}
                          <br />
                          기한: {candidate.due_text}
                        </p>
                        <details>
                          <summary>원문 근거</summary>
                          <blockquote>{candidate.evidence}</blockquote>
                        </details>
                        <button
                          className="quiet full-width"
                          onClick={() => startDraft(candidate)}
                        >
                          <Plus size={15} />
                          일정 후보 만들기
                        </button>
                      </article>
                    ))}
                    {!meeting.candidates.length && (
                      <p className="muted-text">
                        분석 후 담당자와 기한을 확인해 주세요. 자동으로 일정을
                        등록하지 않습니다.
                      </p>
                    )}
                  </aside>
                </div>
              )}
              {view === "health" && (
                <div className="detail-grid">
                  <div>
                    <section className="health-heading">
                      <div>
                        <span className="eyebrow">PERSONAL WELLNESS</span>
                        <h2>작은 실천을 쌓는 일주일</h2>
                        <p>확인한 검진 결과로 시작하는 나의 건강 기록</p>
                      </div>
                      <img
                        src="https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=600&q=85"
                        alt="야외에서 운동하는 사람"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    </section>
                    <section className="band">
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={data.consents.health}
                          disabled={!!busy}
                          onChange={(event) =>
                            run("건강 동의 변경", () =>
                              consent("health", event.target.checked),
                            )
                          }
                        />
                        개인 건강정보 처리에 동의합니다.
                      </label>
                      <div className="toolbar">
                        {data.consents.health && (
                          <HealthScreeningPanel
                            key={data.session_id}
                            sessionId={data.session_id}
                            onResult={() =>
                              run("건강 프로그램 갱신", async () => {})
                            }
                          />
                        )}
                        <button
                          disabled={!!busy || !data.consents.health}
                          onClick={() =>
                            run(
                              "Health Lab 프로그램 가져오기",
                              () => workspaceApi("/connect/health", "POST"),
                              "Health Lab의 운동 프로그램을 가져왔습니다.",
                            )
                          }
                        >
                          <Link2 size={16} />
                          Health Lab 연결
                        </button>
                      </div>
                      <p className="footnote">
                        검진값은 원본과 비교해 확인하세요. Health Lab 연결은
                        8020 포트의 로컬 프로그램을 읽습니다.
                      </p>
                    </section>
                    {wellness.program ? (
                      <>
                        <div className="section-heading">
                          <h2>이번 주 프로그램</h2>
                          <span className="mode">
                            {wellness.program.origin === "health-lab"
                              ? "Health Lab"
                              : "규칙 기반"}
                          </span>
                        </div>
                        {wellness.program.risk_flags?.map((flag, index) => (
                          <div className="banner warning" key={index}>
                            <ShieldAlert size={18} />
                            <div>
                              <strong>{flag.title}</strong>
                              <p>{flag.message}</p>
                            </div>
                          </div>
                        ))}
                        <div className="week-program">
                          {wellness.program.days.map((day, index) => (
                            <article
                              className="day-row"
                              key={`${day.day}-${index}`}
                            >
                              <span className="day-label">{day.day}</span>
                              <div>
                                <strong>{day.title}</strong>
                                <p>{day.activity}</p>
                                <small>{day.duration_minutes}분</small>
                              </div>
                              <button
                                className="icon-button"
                                title="운동 일정 제안"
                                aria-label={`${day.day} 운동 일정 제안`}
                                onClick={() =>
                                  setDraft({
                                    title: "개인 일정",
                                    start: nextTime(),
                                    minutes: day.duration_minutes,
                                    context: "personal",
                                    day_index: index,
                                  })
                                }
                              >
                                <CalendarDays size={19} />
                              </button>
                            </article>
                          ))}
                        </div>
                        <p className="footnote">{wellness.program.notice}</p>
                        <details className="program-details">
                          <summary>운동 순서와 식단 가이드</summary>
                          <ResultCard
                            result={{
                              capability: "health",
                              action: "wellness_program",
                              status: "ok",
                              card: {
                                ...wellness.program,
                                kind: "wellness_program",
                              },
                            }}
                          />
                        </details>
                      </>
                    ) : (
                      <Empty
                        icon={Heart}
                        title="나의 건강계획을 기다리고 있어요"
                        detail="검진 결과를 업로드해 확인하거나 Health Lab에서 만든 프로그램을 가져오세요."
                      />
                    )}
                  </div>
                  <aside className="detail-aside">
                    <h2>나의 활동</h2>
                    <div className="activity-total">
                      <Activity size={22} />
                      <strong>
                        {wellness.activity.reduce(
                          (sum, item) => sum + item.minutes,
                          0,
                        )}
                      </strong>
                      <span>분 기록</span>
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        run(
                          "활동 기록",
                          () =>
                            workspaceApi("/wellness/activity", "POST", {
                              minutes: Number(form.get("minutes")),
                            }),
                          "활동을 기록했습니다.",
                        );
                      }}
                    >
                      <label>
                        오늘 활동한 시간
                        <input
                          type="number"
                          name="minutes"
                          min="1"
                          max="180"
                          defaultValue="20"
                          required
                        />
                      </label>
                      <button
                        className="primary full-width"
                        disabled={!!busy || !data.consents.health}
                      >
                        <Check size={16} />
                        활동 기록
                      </button>
                    </form>
                    {wellness.activity
                      .slice(-5)
                      .reverse()
                      .map((item) => (
                        <div className="activity-entry" key={item.id}>
                          <span>{localTime(item.at)}</span>
                          <strong>{item.minutes}분</strong>
                        </div>
                      ))}
                    <div className="privacy-note">
                      <LockKeyhole size={18} />
                      <p>
                        일정에는 ‘개인 일정’과 시간만 전달합니다.
                        검진값·질환명은 포함하지 않습니다.
                      </p>
                    </div>
                  </aside>
                </div>
              )}
              {view === "safety" && (
                <div className="detail-grid">
                  <section className="band">
                    <div className="section-heading">
                      <h2>
                        <ShieldCheck size={20} />
                        메시지·링크 확인
                      </h2>
                      <span className="mode">설명 가능한 규칙</span>
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        run("위험 신호 확인", async () =>
                          setVerdict(
                            (
                              await workspaceApi("/safety", "POST", {
                                text: safetyText,
                              })
                            ).verdict,
                          ),
                        );
                      }}
                    >
                      <label>
                        확인할 내용
                        <textarea
                          rows={6}
                          maxLength={10000}
                          required
                          placeholder="의심스러운 메시지나 링크를 입력하세요."
                          value={safetyText}
                          onChange={(event) =>
                            setSafetyText(event.target.value)
                          }
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={!!busy || !safetyText.trim()}
                      >
                        <ShieldCheck size={16} />
                        검사하기
                      </button>
                    </form>
                    {verdict && (
                      <div className={`verdict ${verdict.risk_level}`}>
                        <ShieldAlert size={25} />
                        <h3>
                          {verdict.risk_level === "high"
                            ? "위험 신호를 발견했습니다"
                            : verdict.risk_level === "medium"
                              ? "추가 확인이 필요합니다"
                              : "뚜렷한 위험 조합은 발견되지 않았습니다"}
                        </h3>
                        <p>{verdict.reason}</p>
                        <div className="signal-list">
                          {verdict.signals.map((signal) => (
                            <span key={signal}>{signal}</span>
                          ))}
                        </div>
                        <small>
                          안전을 보증하는 결과가 아닙니다. 공식 연락처로 별도
                          확인하세요.
                        </small>
                      </div>
                    )}
                    <p className="footnote">
                      Guardian은 연결된 셸 작업을 통제합니다. 외부 통화나 은행
                      송금을 직접 차단하지 않습니다.
                    </p>
                  </section>
                  <aside className="detail-aside">
                    <h2>회의 안전 경고</h2>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={data.consents.safety}
                        disabled={!!busy}
                        onChange={(event) =>
                          run("안전 검사 변경", () =>
                            consent("safety", event.target.checked),
                          )
                        }
                      />
                      회의 문맥 검사
                    </label>
                    {!data.alerts.length && (
                      <Empty
                        icon={ShieldCheck}
                        title="등록된 경고가 없습니다"
                        detail="회의 수집과 문맥 검사를 켜면 새 발화를 분석합니다."
                      />
                    )}
                    {[...data.alerts].reverse().map((alert) => (
                      <article className="alert-item" key={alert.id}>
                        <small>{localTime(alert.at)}</small>
                        <h3>
                          {alert.verdict.risk_level === "high"
                            ? "위험 신호"
                            : "주의 신호"}
                        </h3>
                        <p>{alert.verdict.reason}</p>
                        {alert.guardian && (
                          <span className="mode">보호자 알림함</span>
                        )}
                      </article>
                    ))}
                  </aside>
                </div>
              )}
              {view === "memory" && (
                <div className="detail-grid">
                  <section className="band">
                    <div className="section-heading">
                      <h2>내가 선택한 기억</h2>
                      <span>{data.notes.length}개</span>
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(
                          "기억 저장",
                          async () => {
                            await workspaceApi("/notes", "POST", {
                              text: note,
                              context: noteContext,
                            });
                            setNote("");
                          },
                          "기억을 저장했습니다.",
                        );
                      }}
                    >
                      <label>
                        기억할 내용
                        <textarea
                          rows={3}
                          value={note}
                          maxLength={2000}
                          required
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="다음 회의 전에 확인할 내용"
                        />
                      </label>
                      <div className="form-actions">
                        <select
                          aria-label="기억 범위"
                          value={noteContext}
                          onChange={(event) =>
                            setNoteContext(event.target.value)
                          }
                        >
                          <option value="personal">개인</option>
                          <option value="work">업무</option>
                        </select>
                        <button
                          className="primary"
                          disabled={!!busy || !note.trim()}
                        >
                          <Plus size={16} />
                          기억 추가
                        </button>
                      </div>
                    </form>
                    <p className="footnote">
                      세션 종료 또는 만료 시 삭제됩니다. 다른 AI 요청에 자동
                      첨부하지 않습니다.
                    </p>
                    {!data.notes.length && (
                      <Empty
                        icon={BookOpen}
                        title="비어 있는 기억함"
                        detail="직접 선택한 내용만 보관합니다."
                      />
                    )}
                    {data.notes.map((item) => (
                      <article className="note-item" key={item.id}>
                        <div>
                          <span className="mode">
                            {item.context === "personal" ? "개인" : "업무"}
                          </span>
                          <p>{item.text}</p>
                          <small>{localTime(item.expires_at)} 만료</small>
                        </div>
                        <button
                          className="icon-button"
                          title="기억 삭제"
                          aria-label="기억 삭제"
                          disabled={!!busy}
                          onClick={() =>
                            run("기억 삭제", () =>
                              workspaceApi(`/notes/${item.id}`, "DELETE"),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </section>
                  <aside className="detail-aside">
                    <div className="section-heading">
                      <h2>실행 기록</h2>
                      <History size={17} />
                    </div>
                    <p className="footnote">
                      내용·비밀값 없이 작업 종류와 시각만 기록합니다.
                    </p>
                    {[...data.audit]
                      .reverse()
                      .slice(0, 30)
                      .map((item) => (
                        <div className="audit-item" key={item.id}>
                          <span className="timeline-dot" />
                          <div>
                            <strong>{item.action}</strong>
                            <small>{localTime(item.at)}</small>
                          </div>
                        </div>
                      ))}
                  </aside>
                </div>
              )}
              {view === "settings" && (
                <div className="settings-layout">
                  <section className="band">
                    <h2>연결 상태</h2>
                    {[
                      {
                        icon: Sparkles,
                        title: "Azure AI",
                        detail: "대화 · 번역 · 후속 작업 · 표현 교정",
                        status: data.ai_configured
                          ? "구성됨"
                          : "서버 환경변수 필요",
                      },
                      {
                        icon: MessageSquare,
                        title: "Teams Translator",
                        detail: "127.0.0.1:8000 · 확정 자막 읽기",
                        status: data.connector.status,
                      },
                      {
                        icon: Heart,
                        title: "AI Health Lab",
                        detail: "127.0.0.1:8020 · 프로그램 가져오기",
                        status:
                          wellness.program?.origin === "health-lab"
                            ? "가져옴"
                            : "요청 시 연결",
                      },
                      {
                        icon: CalendarDays,
                        title: "로컬 일정",
                        detail: "세션 메모리 · Outlook과 동기화되지 않음",
                        status: "사용 가능",
                      },
                    ].map((connection) => (
                      <div className="connection-row" key={connection.title}>
                        <span className="connector-icon">
                          <connection.icon size={22} />
                        </span>
                        <div>
                          <strong>{connection.title}</strong>
                          <p>{connection.detail}</p>
                        </div>
                        <span className="mode">{connection.status}</span>
                      </div>
                    ))}
                  </section>
                  <section className="band">
                    <h2>데이터 동의</h2>
                    {Object.entries(consentLabels).map(([name, label]) => (
                      <label className="setting-row" key={name}>
                        <div>
                          <strong>{label.title}</strong>
                          <p>{label.detail}</p>
                        </div>
                        <input
                          className="switch"
                          type="checkbox"
                          checked={data.consents[name]}
                          disabled={!!busy}
                          onChange={(event) =>
                            run("동의 변경", () =>
                              consent(name, event.target.checked),
                            )
                          }
                        />
                      </label>
                    ))}
                    <p className="footnote">
                      끄더라도 이미 외부 서비스로 전송된 데이터는 회수할 수
                      없습니다. 외부 서비스 보존 정책을 확인하세요.
                    </p>
                  </section>
                  <section className="band">
                    <h2>보호자 & 기능 정책</h2>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(
                          "정책 저장",
                          async () => {
                            await workspaceApi("/policy", "PUT", {
                              allowed_capabilities: capabilities,
                              blocked_domains: domains
                                .split(/\n|,/)
                                .map((item) => item.trim())
                                .filter(Boolean),
                              age_group: age,
                              pin,
                              ...(newPin ? { new_pin: newPin } : {}),
                            });
                            setPin("");
                            setNewPin("");
                          },
                          "정책을 저장했습니다.",
                        );
                      }}
                    >
                      <div className="form-grid">
                        <label>
                          사용자 프로필
                          <select
                            value={age}
                            onChange={(event) => setAge(event.target.value)}
                          >
                            <option value="adult">성인</option>
                            <option value="7-9">7~9세</option>
                            <option value="10-12">10~12세</option>
                            <option value="13-15">13~15세</option>
                          </select>
                        </label>
                        <label>
                          새 보호자 PIN
                          <input
                            type="password"
                            autoComplete="new-password"
                            minLength={6}
                            value={newPin}
                            onChange={(event) => setNewPin(event.target.value)}
                            placeholder="최소 6자"
                          />
                        </label>
                      </div>
                      {data.guardian_locked && (
                        <label>
                          현재 보호자 PIN
                          <input
                            type="password"
                            autoComplete="current-password"
                            required
                            value={pin}
                            onChange={(event) => setPin(event.target.value)}
                          />
                        </label>
                      )}
                      <div className="capabilities">
                        {Object.entries(capabilityLabels).map(
                          ([key, label]) => (
                            <label key={key}>
                              <input
                                type="checkbox"
                                checked={capabilities.includes(key)}
                                onChange={(event) =>
                                  setCapabilities((current) =>
                                    event.target.checked
                                      ? [...current, key]
                                      : current.filter((item) => item !== key),
                                  )
                                }
                              />
                              {label}
                            </label>
                          ),
                        )}
                      </div>
                      <label>
                        차단 도메인
                        <textarea
                          rows={2}
                          value={domains}
                          onChange={(event) => setDomains(event.target.value)}
                          placeholder="example.com"
                        />
                      </label>
                      <button className="primary" disabled={!!busy}>
                        <LockKeyhole size={16} />
                        정책 저장
                      </button>
                    </form>
                    <p className="footnote">
                      이 세션에만 적용됩니다. 새 세션 생성이나 다른 Windows 앱을
                      막는 기기 관리 기능은 아닙니다.
                    </p>
                  </section>
                  <section className="danger-zone">
                    <h2>세션 삭제</h2>
                    <p>
                      회의·건강·기억·작업·로컬 일정과 세션 토큰을 모두
                      삭제합니다. 원본 Health Lab·Translator의 기록은 삭제하지
                      않습니다.
                    </p>
                    <button
                      className="danger"
                      onClick={() =>
                        setDeleteTarget({
                          path: "",
                          label: "현재 세션의 모든 기록 삭제",
                        })
                      }
                    >
                      <Trash2 size={16} />
                      세션 삭제
                    </button>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            <span>GUARDIAN · YOUR INTENT. YOUR CONTROL.</span>
            <span>
              <LockKeyhole size={12} />
              승인 기반 작업 공간
            </span>
          </footer>
        </div>
      </div>
      {draft && (
        <Modal
          title={
            draft.day_index !== undefined ? "개인 운동 일정" : "새 일정 후보"
          }
          onClose={() => setDraft(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(
                "일정 후보 생성",
                async () => {
                  if (draft.day_index !== undefined)
                    await workspaceApi("/wellness/schedule", "POST", {
                      start: new Date(draft.start).toISOString(),
                      day_index: draft.day_index,
                    });
                  else
                    await workspaceApi("/tasks", "POST", {
                      ...draft,
                      start: new Date(draft.start).toISOString(),
                    });
                  setDraft(null);
                  setView("overview");
                },
                "승인 대기 중입니다. 내용을 검토한 뒤 승인하세요.",
              );
            }}
          >
            <label>
              제목
              <input
                required
                maxLength={200}
                value={draft.context === "personal" ? "개인 일정" : draft.title}
                disabled={draft.context === "personal"}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                시작 시간
                <input
                  type="datetime-local"
                  required
                  value={draft.start}
                  onChange={(event) =>
                    setDraft({ ...draft, start: event.target.value })
                  }
                />
              </label>
              <label>
                시간(분)
                <input
                  type="number"
                  required
                  min="5"
                  max="180"
                  value={draft.minutes}
                  disabled={draft.day_index !== undefined}
                  onChange={(event) =>
                    setDraft({ ...draft, minutes: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            {draft.day_index === undefined && (
              <label>
                범위
                <select
                  value={draft.context}
                  onChange={(event) =>
                    setDraft({ ...draft, context: event.target.value })
                  }
                >
                  <option value="work">업무</option>
                  <option value="personal">개인 · 제목 비공개</option>
                </select>
              </label>
            )}
            {draft.day_index !== undefined && <div className="slot-picker">
              <button type="button" disabled={!!busy} onClick={() => run("빈 시간 확인", async () => {
                const result = await workspaceApi("/wellness/slots", "POST", { start: zonedTime(draft.start), day_index: draft.day_index });
                setSlots(result.slots);
              })}><Clock3 size={16} />로컬 일정에서 빈 시간 찾기</button>
              <div className="toolbar">{slots.map(slot => <button type="button" key={slot} className="quiet compact" onClick={() => {
                const date = new Date(slot);
                setDraft({ ...draft, start: new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
              }}>{localTime(slot)}</button>)}</div>
            </div>}
            <div className="privacy-note">
              <LockKeyhole size={17} />
              <p>
                이 브라우저 시간대:{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
                <br />
                로컬 일정 후보이며, 다음 단계에서 승인이 필요합니다.
              </p>
            </div>
            <button className="primary full-width" disabled={!!busy}>
              <Plus size={16} />
              승인 대기에 추가
            </button>
          </form>
        </Modal>
      )}
      {approval && (
        <Modal title="이 작업을 승인할까요?" onClose={() => setApproval(null)}>
          <div className="approval-preview">
            <CalendarDays size={24} />
            <h3>{approval.arguments.title}</h3>
            <p>
              {localTime(approval.arguments.start)} ·{" "}
              {approval.arguments.minutes}분
            </p>
            <span className="mode">비공개 · 로컬 일정</span>
          </div>
          <dl className="approval-fields">
            <dt>실행 대상</dt>
            <dd>이 세션의 로컬 일정</dd>
            <dt>전달 필드</dt>
            <dd>제목, 시각, 시간, 공개 범위</dd>
            <dt>승인 만료</dt>
            <dd>{localTime(approval.expires_at)}</dd>
            <dt>외부 전송</dt>
            <dd>없음 · Outlook 미연결</dd>
          </dl>
          <details>
            <summary>실제 실행 데이터</summary>
            <pre>{JSON.stringify(approval.arguments, null, 2)}</pre>
          </details>
          <button
            className="primary full-width"
            disabled={!!busy}
            onClick={() =>
              run(
                "승인 및 일정 등록",
                async () => {
                  await workspaceApi(`/tasks/${approval.id}/approve`, "POST", {
                    fingerprint: approval.fingerprint,
                  });
                  setApproval(null);
                },
                "로컬 일정에 등록했습니다.",
              )
            }
          >
            <CheckCheck size={17} />
            승인하고 등록
          </button>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title={deleteTarget.label} onClose={() => setDeleteTarget(null)}>
          <p>이 작업은 되돌릴 수 없습니다. 계속할까요?</p>
          <button
            className="danger full-width"
            disabled={!!busy}
            onClick={() =>
              run(
                "기록 삭제",
                async () => {
                  await workspaceApi(deleteTarget.path, "DELETE");
                  if (deleteTarget.path === "") {
                    sessionStorage.removeItem("guardian-token");
                    setChat([]);
                    setTips([]);
                    setNote("");
                    setPin("");
                    setNewPin("");
                    setDraft(null);
                    setApproval(null);
                    setFocusEnd(null);
                    setInput("");
                    setTranscript("");
                    setSafetyText("");
                    setVerdict(null);
                    await openWorkspace();
                  }
                  if (deleteTarget.path === "/meeting") { setTips([]); setTranscript(""); }
                  setDeleteTarget(null);
                },
                "삭제했습니다.",
              )
            }
          >
            <Trash2 size={17} />
            삭제 확인
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const element = dialog.current;
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
