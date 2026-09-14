import { Html } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CAPABILITY_IDS, CAPABILITY_META, type CapabilityId, type OrbState } from "../types";

const STATE_COLOR: Record<OrbState, string> = {
  idle: "#7aa7ff",
  listening: "#5be3c5",
  thinking: "#ffb84f",
  speaking: "#ff7ab8",
};

const STATE_LABEL: Record<OrbState, string> = {
  idle: "대기 중",
  listening: "듣고 있어요",
  thinking: "생각 중...",
  speaking: "이야기하는 중",
};

function OrbMesh({ state }: { state: OrbState }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(STATE_COLOR[state]), [state]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * (state === "thinking" ? 0.9 : 0.25);
    const pulse = state === "listening" ? 1 + Math.sin(Date.now() * 0.006) * 0.04 : state === "speaking" ? 1.06 : 1;
    mesh.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.3} metalness={0.15} />
    </mesh>
  );
}

function Face({ state }: { state: OrbState }) {
  const mouthRef = useRef<THREE.Mesh>(null);
  const eyeScaleY = state === "thinking" ? 0.35 : 1;

  useFrame(() => {
    const mouth = mouthRef.current;
    if (!mouth) return;
    const t = Date.now() * 0.012;
    const open = state === "speaking" ? 0.4 + Math.abs(Math.sin(t)) * 0.7 : state === "listening" ? 0.55 : 0.25;
    mouth.scale.y = open;
  });

  return (
    <group position={[0, 0, 1.02]}>
      <mesh position={[-0.32, 0.15, 0]} scale={[1, eyeScaleY, 1]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#16203a" />
      </mesh>
      <mesh position={[0.32, 0.15, 0]} scale={[1, eyeScaleY, 1]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#16203a" />
      </mesh>
      <mesh ref={mouthRef} position={[0, -0.3, 0]}>
        <boxGeometry args={[0.42, 0.14, 0.05]} />
        <meshStandardMaterial color="#16203a" />
      </mesh>
    </group>
  );
}

function OrbitingIcon({
  index,
  total,
  revealed,
  emoji,
  label,
  onClick,
}: {
  index: number;
  total: number;
  revealed: boolean;
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const angleOffset = (index / total) * Math.PI * 2;

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const radius = revealed ? 2.7 : 1.55;
    const angle = angleOffset + clock.elapsedTime * 0.22;
    group.position.set(Math.cos(angle) * radius, Math.sin(angle * 0.6) * 0.35, Math.sin(angle) * radius);
  });

  return (
    <group ref={groupRef}>
      <Html center transform={false} style={{ pointerEvents: "auto" }}>
        <button
          className="orb-icon"
          style={{ opacity: revealed ? 1 : 0.5, transform: `scale(${revealed ? 1 : 0.85})` }}
          title={label}
          onClick={onClick}
        >
          {emoji}
        </button>
      </Html>
    </group>
  );
}

interface OrbProps {
  state: OrbState;
  onCapabilityPick: (id: CapabilityId) => void;
}

export default function Orb({ state, onCapabilityPick }: OrbProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className="orb-canvas"
      onPointerDown={() => setRevealed(true)}
      onPointerUp={() => setRevealed(false)}
      onPointerLeave={() => setRevealed(false)}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[4, 4, 4]} intensity={1.3} />
        <pointLight position={[-4, -2, -3]} intensity={0.4} color="#7aa7ff" />
        <OrbMesh state={state} />
        <Face state={state} />
        {CAPABILITY_IDS.map((id, i) => (
          <OrbitingIcon
            key={id}
            index={i}
            total={CAPABILITY_IDS.length}
            revealed={revealed}
            emoji={CAPABILITY_META[id].emoji}
            label={CAPABILITY_META[id].label}
            onClick={() => onCapabilityPick(id)}
          />
        ))}
      </Canvas>
      <div className="orb-state-label">{STATE_LABEL[state]}</div>
      <div className="orb-hint">오브를 눌러서 끌면 기능이 펼쳐져요</div>
    </div>
  );
}
