import { useEffect, useRef, useState } from "react";
import { createSession, sendIntent } from "./api";
import Orb from "./components/Orb";
import ResultCard from "./components/ResultCard";
import { CAPABILITY_META, type CapabilityId, type CapabilityResult, type OrbState } from "./types";

const CHILD_NAME = "우리 아이";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [input, setInput] = useState("");
  const [results, setResults] = useState<CapabilityResult[]>([]);
  const speakingTimer = useRef<number | null>(null);

  useEffect(() => {
    createSession(CHILD_NAME, "10-12").then((res) => setSessionId(res.session_id));
  }, []);

  function pickCapability(id: CapabilityId) {
    setInput(CAPABILITY_META[id].example);
    setOrbState("listening");
    window.setTimeout(() => setOrbState("idle"), 900);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    setOrbState("thinking");
    try {
      const response = await sendIntent(sessionId, text);
      setResults(response.results);
      setOrbState("speaking");
      if (speakingTimer.current) window.clearTimeout(speakingTimer.current);
      speakingTimer.current = window.setTimeout(() => setOrbState("idle"), 2500);
    } catch (err) {
      setResults([{ capability: "-", action: "-", status: "error", card: { title: "오류", message: String(err) } }]);
      setOrbState("idle");
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>🧒 AIOS Guardian</h1>
        <span className="app__subtitle">3D 오브 UI</span>
      </header>

      <main className="app__main">
        <Orb state={orbState} onCapabilityPick={pickCapability} />

        <div className="app__results">
          {results.length === 0 && <div className="app__empty">오브를 눌러 기능을 골라보거나 직접 말해보세요.</div>}
          {results.map((r, i) => (
            <ResultCard key={i} result={r} />
          ))}
        </div>
      </main>

      <form className="app__input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOrbState("listening");
          }}
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
