import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * AI-Native OS — 3D Orb Shell
 * A glowing orb with an animated face acts as the "OS core". Dragging
 * up/down/left/right orbits a ring of capability icons into view,
 * replacing the traditional home-screen icon grid. Orb face state
 * reflects idle / listening / thinking / speaking.
 * ------------------------------------------------------------------ */

const SESSION_ID = "orb-" + Math.random().toString(36).slice(2, 8);

// ---------- Renderer / Scene / Camera ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 8);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

scene.add(new THREE.AmbientLight(0x6677ff, 0.6));
const keyLight = new THREE.PointLight(0x99bbff, 1.4, 20);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

// ---------- Orb core ----------
const orbGroup = new THREE.Group();
scene.add(orbGroup);

const orbGeom = new THREE.SphereGeometry(1.4, 64, 64);
const orbMat = new THREE.MeshPhysicalMaterial({
  color: 0x2a3a7a,
  emissive: 0x3355cc,
  emissiveIntensity: 0.5,
  metalness: 0.3,
  roughness: 0.25,
  clearcoat: 0.6,
  transparent: true,
  opacity: 0.92,
});
const orbMesh = new THREE.Mesh(orbGeom, orbMat);
orbGroup.add(orbMesh);

// Soft glow behind the orb (fake bloom via additive sprite)
const glowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(110,168,254,0.55)");
  g.addColorStop(1, "rgba(110,168,254,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const glowSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
);
glowSprite.scale.set(6, 6, 1);
orbGroup.add(glowSprite);

// ---------- Face (drawn on canvas, applied to a billboard plane) ----------
const faceCanvas = document.createElement("canvas");
faceCanvas.width = faceCanvas.height = 512;
const fctx = faceCanvas.getContext("2d");
const faceTexture = new THREE.CanvasTexture(faceCanvas);
const facePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2.1, 2.1),
  new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })
);
facePlane.position.set(0, 0, 1.42);
orbGroup.add(facePlane);

const faceState = {
  mode: "idle", // idle | listening | thinking | speaking
  blink: 0,
  nextBlinkAt: performance.now() + 2000,
  mouthPhase: 0,
  t: 0,
};

function drawFace() {
  const w = faceCanvas.width;
  const h = faceCanvas.height;
  fctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const eyeY = h * 0.42;
  const eyeDX = w * 0.16;
  const blinkAmt = faceState.blink; // 0 = open, 1 = closed

  // Eyes
  fctx.fillStyle = "#eaf1ff";
  [-1, 1].forEach((side) => {
    const ex = cx + side * eyeDX;
    const openH = (faceState.mode === "listening" ? 34 : 26) * (1 - blinkAmt) + 2;
    fctx.beginPath();
    fctx.ellipse(ex, eyeY, 22, openH, 0, 0, Math.PI * 2);
    fctx.fill();
    // pupil
    if (blinkAmt < 0.6) {
      fctx.fillStyle = "#1a2440";
      fctx.beginPath();
      fctx.ellipse(ex, eyeY, 9, Math.min(9, openH * 0.6), 0, 0, Math.PI * 2);
      fctx.fill();
      fctx.fillStyle = "#eaf1ff";
    }
  });

  // Mouth
  const mouthY = h * 0.62;
  fctx.strokeStyle = "#eaf1ff";
  fctx.lineWidth = 10;
  fctx.lineCap = "round";
  fctx.beginPath();
  if (faceState.mode === "speaking") {
    const open = 14 + Math.abs(Math.sin(faceState.mouthPhase * 6)) * 22;
    fctx.ellipse(cx, mouthY, 30, open, 0, 0, Math.PI * 2);
    fctx.fillStyle = "#1a2440";
    fctx.fill();
  } else if (faceState.mode === "listening") {
    fctx.ellipse(cx, mouthY, 16, 16, 0, 0, Math.PI * 2);
    fctx.fillStyle = "#1a2440";
    fctx.fill();
  } else if (faceState.mode === "thinking") {
    fctx.moveTo(cx - 26, mouthY);
    fctx.lineTo(cx + 26, mouthY - 6 * Math.sin(faceState.t * 4));
    fctx.stroke();
  } else {
    // idle: gentle smile
    fctx.moveTo(cx - 28, mouthY - 4);
    fctx.quadraticCurveTo(cx, mouthY + 16, cx + 28, mouthY - 4);
    fctx.stroke();
  }

  faceTexture.needsUpdate = true;
}

function setMode(mode) {
  faceState.mode = mode;
  document.getElementById("status-mode").textContent =
    mode === "listening" ? "🎙 듣는 중..." :
    mode === "thinking"  ? "⏳ 처리 중..." :
    mode === "speaking"  ? "💬 응답 중..." :
                            "🎙 대기중";
}

// ---------- Orbiting capability icons ----------
const ICONS = [
  { id: "calendar",       emoji: "📅", label: "일정",   theta: 0,              phi: 0 },
  { id: "web_search",     emoji: "🔎", label: "검색",   theta: Math.PI / 2,    phi: 0 },
  { id: "device_control", emoji: "💡", label: "기기",   theta: Math.PI,        phi: 0 },
  { id: "files",          emoji: "📁", label: "파일",   theta: -Math.PI / 2,   phi: 0 },
  { id: "settings",       emoji: "⚙️", label: "설정",   theta: 0,              phi: Math.PI / 2.4 },
  { id: "history",        emoji: "🕘", label: "기록",   theta: 0,              phi: -Math.PI / 2.4 },
];

const PRESET_TEXT = {
  calendar: "내일 오후 3시에 팀 회의 잡아줘",
  web_search: "최신 AI 뉴스 찾아줘",
  device_control: "거실 조명 켜줘",
  files: "보고서 파일 찾아줘",
  settings: "(데모) 설정 화면은 아직 시뮬레이션되지 않습니다.",
  history: "(데모) 대화 기록 보기는 아직 시뮬레이션되지 않습니다.",
};

function makeIconTexture(emoji, label) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(26,29,41,0.85)";
  roundRect(ctx, 8, 8, 240, 240, 40);
  ctx.fill();
  ctx.strokeStyle = "rgba(110,168,254,0.5)";
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, 240, 240, 40);
  ctx.stroke();
  ctx.font = "110px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 128, 108);
  ctx.font = "bold 34px sans-serif";
  ctx.fillStyle = "#e8e8ec";
  ctx.fillText(label, 128, 205);
  return new THREE.CanvasTexture(c);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ringGroup = new THREE.Group();
scene.add(ringGroup);

const RING_RADIUS = 3.4;
const iconSprites = [];
ICONS.forEach((cfg) => {
  const tex = makeIconTexture(cfg.emoji, cfg.label);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.1, 1.1, 1);
  const x = RING_RADIUS * Math.cos(cfg.phi) * Math.sin(cfg.theta);
  const y = RING_RADIUS * Math.sin(cfg.phi);
  const z = RING_RADIUS * Math.cos(cfg.phi) * Math.cos(cfg.theta);
  sprite.position.set(x, y, z);
  sprite.userData = cfg;
  ringGroup.add(sprite);
  iconSprites.push(sprite);
});

// ---------- Drag-to-orbit navigation ----------
let dragging = false;
let lastX = 0, lastY = 0;
let targetRotY = 0, targetRotX = 0;
let currentRotY = 0, currentRotX = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener("pointerup", () => (dragging = false));
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  targetRotY += dx * 0.005;
  targetRotX = Math.max(-1.0, Math.min(1.0, targetRotX + dy * 0.005));
});

// Raycaster for icon clicks
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener("click", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(iconSprites);
  if (hits.length > 0) {
    const cfg = hits[0].object.userData;
    triggerIntent(PRESET_TEXT[cfg.id] || cfg.label);
  }
});

// ---------- Backend integration ----------
const cardPanel = document.getElementById("card-panel");
const form = document.getElementById("intent-form");
const input = document.getElementById("intent-input");

function addCard(card) {
  const div = document.createElement("div");
  div.className = "card";
  const h3 = document.createElement("h3");
  h3.textContent = card.title;
  div.appendChild(h3);
  const pre = document.createElement("pre");
  pre.textContent = card.body;
  div.appendChild(pre);
  if (card.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "actions";
    card.actions.forEach((label) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.onclick = () => alert(`(데모) '${label}' 액션은 아직 시뮬레이션되지 않습니다.`);
      actions.appendChild(btn);
    });
    div.appendChild(actions);
  }
  cardPanel.prepend(div);
  while (cardPanel.children.length > 6) cardPanel.removeChild(cardPanel.lastChild);
}

async function triggerIntent(text) {
  if (!text) return;
  setMode("thinking");
  try {
    const res = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID, text }),
    });
    const data = await res.json();
    setMode("speaking");
    faceState.mouthPhase = 0;
    data.cards.forEach(addCard);
    setTimeout(() => setMode("idle"), 1600);
  } catch (err) {
    console.error(err);
    setMode("idle");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  input.value = "";
  triggerIntent(text);
});
input.addEventListener("focus", () => setMode("listening"));
input.addEventListener("blur", () => {
  if (faceState.mode === "listening") setMode("idle");
});

async function loadState() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    document.getElementById("status-location").textContent = `📍 ${state.location}`;
    document.getElementById("status-battery").textContent = `🔋 ${state.battery}%`;
  } catch (e) { /* ignore */ }
}
loadState();

// ---------- Animation loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  faceState.t += dt;
  faceState.mouthPhase += dt;

  // smooth camera-orbit toward drag target
  currentRotY += (targetRotY - currentRotY) * 0.08;
  currentRotX += (targetRotX - currentRotX) * 0.08;
  ringGroup.rotation.y = currentRotY;
  ringGroup.rotation.x = currentRotX;

  // idle breathing + auto slow spin when not dragging
  if (!dragging) targetRotY += dt * 0.05;
  const breathe = 1 + Math.sin(faceState.t * 1.4) * 0.02;
  orbMesh.scale.setScalar(breathe);
  glowSprite.material.opacity = 0.7 + Math.sin(faceState.t * 1.4) * 0.15;

  // blinking
  const now = performance.now();
  if (now > faceState.nextBlinkAt) {
    faceState.blink = 1;
    faceState.nextBlinkAt = now + 120;
  }
  if (faceState.blink > 0) {
    faceState.blink -= dt * 6;
    if (faceState.blink <= 0) {
      faceState.blink = 0;
      faceState.nextBlinkAt = now + 2000 + Math.random() * 3000;
    }
  }

  drawFace();
  facePlane.quaternion.copy(camera.quaternion); // billboard toward camera

  renderer.render(scene, camera);
}
animate();
