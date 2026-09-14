import { useEffect, useRef, useState } from "react";
import { createSession, sendIntent } from "./api";
import ParentSettingsPanel from "./components/ParentSettingsPanel";
import ResultCard from "./components/ResultCard";
import HealthScreeningPanel from "./components/HealthScreeningPanel";
import type { AgeGroup, ParentPolicy, Turn } from "./types";

const CHILD_NAME = "사용자";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("adult");
  const [policy, setPolicy] = useState<ParentPolicy | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createSession(CHILD_NAME, ageGroup).then((res) => {
      setSessionId(res.session_id);
      setPolicy(res.policy as ParentPolicy);
      setTurns([]);
    });
  }, [ageGroup]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    setStatus("thinking");
    try {
      const response = await sendIntent(sessionId, text);
      setTurns((prev) => [...prev, { text, results: response.results }]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { text, results: [{ capability: "-", action: "-", status: "error", card: { title: "오류", message: String(err) } }] },
      ]);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>🧒 AIOS Guardian</h1>
        <span className="app__subtitle">아이를 위한 2D 카드 캔버스</span>
        {policy && sessionId && (
          <HealthScreeningPanel
            sessionId={sessionId}
            onResult={(result) => setTurns((prev) => [...prev, { text: "건강검진 결과 확인", results: [result] }])}
          />
        )}
        {policy && sessionId && (
          <ParentSettingsPanel
            sessionId={sessionId}
            policy={policy}
            ageGroup={ageGroup}
            onAgeGroupChange={setAgeGroup}
            onPolicyChange={setPolicy}
          />
        )}
      </header>

      <main className="app__canvas" ref={scrollRef}>
        {turns.length === 0 && (
          <div className="app__empty">무엇이든 물어보거나, 하고 싶은 걸 말해보세요! 예) "볼륨 높여줘 그리고 화산은 어떻게 생겨?"</div>
        )}
        {turns.map((turn, i) => (
          <section className="turn" key={i}>
            <div className="turn__bubble">{turn.text}</div>
            <div className="turn__results">
              {turn.results.map((r, j) => (
                <ResultCard key={j} result={r} />
              ))}
            </div>
          </section>
        ))}
        {status === "thinking" && <div className="app__thinking">생각하고 있어요...</div>}
      </main>

      <form className="app__input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="여기에 말해보세요..."
          aria-label="intent input"
        />
        <button type="submit" disabled={!sessionId}>
          보내기
        </button>
      </form>
    </div>
  );
}
