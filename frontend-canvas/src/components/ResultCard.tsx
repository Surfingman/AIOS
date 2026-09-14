import type { CapabilityResult } from "../types";

function Blocked({ result }: { result: CapabilityResult }) {
  return (
    <div className="card card--blocked">
      <div className="card__title">🛡️ {result.card.title ?? "차단됨"}</div>
      <div className="card__body">{result.card.message}</div>
          {(result.card.signals ?? result.safety?.signals ?? []).length > 0 && (
            <div className="card__signals">감지 신호: {(result.card.signals ?? result.safety?.signals).join(" · ")}</div>
          )}
          {(result.card.next_steps ?? []).length > 0 && (
            <ol className="card__actions">{result.card.next_steps.map((step: string, index: number) => <li key={index}>{step}</li>)}</ol>
          )}
    </div>
  );
}

function ErrorCard({ result }: { result: CapabilityResult }) {
  return (
    <div className="card card--error">
      <div className="card__title">⚠️ {result.card.title ?? "오류"}</div>
      <div className="card__body">{result.card.message}</div>
    </div>
  );
}

function StepByStep({ steps }: { steps: { emoji: string; text: string }[] }) {
  return (
    <div className="card card--steps">
      <ol className="steps">
        {steps.map((step, i) => (
          <li key={i} className="steps__item">
            <span className="steps__emoji">{step.emoji}</span>
            <span className="steps__text">{step.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SearchResults({ card }: { card: Record<string, any> }) {
  return (
    <div className="card">
      <div className="card__title">🔍 {card.title}</div>
      <ul className="link-list">
        {(card.results ?? []).map((r: any, i: number) => (
          <li key={i}>{r.label}</li>
        ))}
      </ul>
    </div>
  );
}

function EventCreated({ card }: { card: Record<string, any> }) {
  const event = card.event ?? {};
  return (
    <div className="card">
      <div className="card__title">📅 {card.title}</div>
      <div className="card__body">
        {event.date} {event.time} · {event.title}
      </div>
    </div>
  );
}

function EventList({ card }: { card: Record<string, any> }) {
  return (
    <div className="card">
      <div className="card__title">📅 {card.title}</div>
      <ul className="link-list">
        {(card.items ?? []).map((e: any, i: number) => (
          <li key={i}>
            {e.date} {e.time} · {e.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeviceState({ card }: { card: Record<string, any> }) {
  const state = card.state ?? {};
  return (
    <div className="card">
      <div className="card__title">🎛️ {card.title}</div>
      <div className="card__body">
        🔊 볼륨 {state.volume} · 💡 밝기 {state.brightness} · 📶 와이파이 {state.wifi ? "켜짐" : "꺼짐"}
      </div>
    </div>
  );
}

function FileList({ card }: { card: Record<string, any> }) {
  return (
    <div className="card">
      <div className="card__title">📁 {card.title}</div>
      <ul className="link-list">
        {(card.items ?? []).map((f: any, i: number) => (
          <li key={i}>{f.name}</li>
        ))}
      </ul>
    </div>
  );
}

function WellnessProgram({ card }: { card: Record<string, any> }) {
  return (
    <div className="card card--wellness">
      <div className="card__title">{card.title}</div>
      <div className="card__body">하루 {card.daily_minutes}분 · 강도 {card.intensity}</div>
      {(card.risk_flags ?? []).map((flag: any, index: number) => (
        <div className={`health-flag health-flag--${flag.severity}`} key={index}>
          <strong>{flag.title}</strong> {flag.message}
        </div>
      ))}
      <div className="wellness-days">
        {(card.days ?? []).map((day: any) => (
          <section className="wellness-day" key={day.day}>
            <strong>{day.day} · {day.title}</strong>
            <span>{day.duration_minutes}분 · {day.activity}</span>
            <ol>
              {(day.visual_steps ?? []).map((step: any, index: number) => <li key={index}>{step.emoji} {step.text}</li>)}
            </ol>
            {(day.meals ?? []).map((meal: any, index: number) => <div className="meal-guide" key={index}><strong>{meal.meal} · {meal.name}</strong><ol>{(meal.steps ?? []).map((step: string, stepIndex: number) => <li key={stepIndex}>{step}</li>)}</ol></div>)}
          </section>
        ))}
      </div>
      <div className="meal-guide">
        {(card.meal_guide ?? []).map((meal: any) => <div key={meal.meal}><strong>{meal.meal}</strong> · {meal.plate.join(" / ")}</div>)}
      </div>
      {(card.personal_considerations ?? []).map((item: any) => (
        <div className="health-flag" key={item.title}><strong>{item.title}</strong> · {item.items.join(", ")}</div>
      ))}
      <div className="card__notice">{card.notice}</div>
      <div className="card__sources">생성: {new Date(card.generated_at).toLocaleString()}<br />출처: {(card.sources ?? []).join(" · ")}</div>
    </div>
  );
}

export default function ResultCard({ result }: { result: CapabilityResult }) {
  if (result.status === "blocked") return <Blocked result={result} />;
  if (result.status === "error") return <ErrorCard result={result} />;

  switch (result.card.kind) {
    case "step_by_step":
      return <StepByStep steps={result.card.steps} />;
    case "search_results":
      return <SearchResults card={result.card} />;
    case "event_created":
      return <EventCreated card={result.card} />;
    case "list":
      return <EventList card={result.card} />;
    case "device_state":
      return <DeviceState card={result.card} />;
    case "file_list":
      return <FileList card={result.card} />;
    case "wellness_program":
      return <WellnessProgram card={result.card} />;
    default:
      return (
        <div className="card">
          <div className="card__title">{result.card.title ?? result.capability}</div>
        </div>
      );
  }
}
