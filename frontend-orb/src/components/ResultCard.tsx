import type { CapabilityResult } from "../types";

export default function ResultCard({ result }: { result: CapabilityResult }) {
  if (result.status === "blocked") {
    return (
      <div className="card card--blocked">
        <div className="card__title">🛡️ {result.card.title ?? "차단됨"}</div>
        <div className="card__body">{result.card.message}</div>
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="card card--error">
        <div className="card__title">⚠️ {result.card.title ?? "오류"}</div>
        <div className="card__body">{result.card.message}</div>
      </div>
    );
  }

  switch (result.card.kind) {
    case "step_by_step":
      return (
        <div className="card">
          <ol className="steps">
            {result.card.steps.map((step: any, i: number) => (
              <li key={i} className="steps__item">
                <span className="steps__emoji">{step.emoji}</span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "search_results":
      return (
        <div className="card">
          <div className="card__title">🔍 {result.card.title}</div>
          <ul className="link-list">
            {result.card.results.map((r: any, i: number) => (
              <li key={i}>{r.label}</li>
            ))}
          </ul>
        </div>
      );
    case "event_created":
      return (
        <div className="card">
          <div className="card__title">📅 {result.card.title}</div>
          <div className="card__body">
            {result.card.event.date} {result.card.event.time} · {result.card.event.title}
          </div>
        </div>
      );
    case "list":
      return (
        <div className="card">
          <div className="card__title">📅 {result.card.title}</div>
          <ul className="link-list">
            {result.card.items.map((e: any, i: number) => (
              <li key={i}>
                {e.date} {e.time} · {e.title}
              </li>
            ))}
          </ul>
        </div>
      );
    case "device_state":
      return (
        <div className="card">
          <div className="card__title">🎛️ {result.card.title}</div>
          <div className="card__body">
            🔊 {result.card.state.volume} · 💡 {result.card.state.brightness} · 📶{" "}
            {result.card.state.wifi ? "켜짐" : "꺼짐"}
          </div>
        </div>
      );
    case "file_list":
      return (
        <div className="card">
          <div className="card__title">📁 {result.card.title}</div>
          <ul className="link-list">
            {result.card.items.map((f: any, i: number) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
        </div>
      );
    default:
      return (
        <div className="card">
          <div className="card__title">{result.card.title ?? result.capability}</div>
        </div>
      );
  }
}
