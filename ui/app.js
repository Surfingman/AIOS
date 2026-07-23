const API_BASE = "";
const SESSION_ID = "demo-" + Math.random().toString(36).slice(2, 8);

const canvas = document.getElementById("canvas");
const emptyHint = document.getElementById("empty-hint");
const form = document.getElementById("intent-form");
const input = document.getElementById("intent-input");

async function loadState() {
  try {
    const res = await fetch(`${API_BASE}/api/state`);
    const state = await res.json();
    document.getElementById("status-location").textContent = `📍 ${state.location}`;
    document.getElementById("status-battery").textContent = `🔋 ${state.battery}%`;
    document.getElementById("status-form").textContent = `🖥 ${state.form_factor}`;
  } catch (e) {
    console.error("state load failed", e);
  }
}

function addUserTurn(text) {
  emptyHint.style.display = "none";
  const div = document.createElement("div");
  div.className = "turn";
  div.textContent = text;
  canvas.appendChild(div);
  canvas.scrollTop = canvas.scrollHeight;
}

function addCard(card) {
  const div = document.createElement("div");
  div.className = "card";

  const h3 = document.createElement("h3");
  h3.textContent = card.title;
  div.appendChild(h3);

  const pre = document.createElement("pre");
  pre.textContent = card.body;
  div.appendChild(pre);

  if (card.actions && card.actions.length) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "actions";
    card.actions.forEach((label) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.onclick = () => alert(`(데모) '${label}' 액션은 아직 시뮬레이션되지 않습니다.`);
      actionsDiv.appendChild(btn);
    });
    div.appendChild(actionsDiv);
  }

  if (card.permissions_used && card.permissions_used.length) {
    const perms = document.createElement("div");
    perms.className = "perms";
    perms.textContent = "권한 사용: " + card.permissions_used.join(", ");
    div.appendChild(perms);
  }

  canvas.appendChild(div);
  canvas.scrollTop = canvas.scrollHeight;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addUserTurn(text);
  input.value = "";

  try {
    const res = await fetch(`${API_BASE}/api/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID, text }),
    });
    const data = await res.json();
    data.cards.forEach(addCard);
  } catch (err) {
    console.error(err);
    addCard({
      title: "⚠️ 오류",
      body: "서버와 통신하는 중 문제가 발생했습니다.",
      actions: [],
      permissions_used: [],
    });
  }
});

loadState();
