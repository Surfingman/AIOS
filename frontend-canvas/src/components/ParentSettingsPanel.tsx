import { useState } from "react";
import { updatePolicy } from "../api";
import { CAPABILITY_IDS, CAPABILITY_LABELS, type AgeGroup, type ParentPolicy } from "../types";

interface Props {
  sessionId: string;
  policy: ParentPolicy;
  ageGroup: AgeGroup;
  onAgeGroupChange: (group: AgeGroup) => void;
  onPolicyChange: (policy: ParentPolicy) => void;
}

export default function ParentSettingsPanel({ sessionId, policy, ageGroup, onAgeGroupChange, onPolicyChange }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleCapability(id: string) {
    const next = policy.allowed_capabilities.includes(id)
      ? policy.allowed_capabilities.filter((c) => c !== id)
      : [...policy.allowed_capabilities, id];
    onPolicyChange({ ...policy, allowed_capabilities: next });
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await updatePolicy(sessionId, policy);
      onPolicyChange(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="parent-panel">
      <button className="parent-panel__toggle" onClick={() => setOpen((o) => !o)}>
        ⚙️ 권한 설정 {open ? "숨기기" : "열기"}
      </button>
      {open && (
        <div className="parent-panel__body">
          <label className="parent-panel__row">
            연령대
            <select value={ageGroup} onChange={(e) => onAgeGroupChange(e.target.value as AgeGroup)}>
              <option value="7-9">7-9세</option>
              <option value="10-12">10-12세</option>
              <option value="13-15">13-15세</option>
              <option value="adult">성인</option>
            </select>
          </label>
          <div className="parent-panel__row">
            허용 목록 (Allow-list)
            <div className="parent-panel__capabilities">
              {CAPABILITY_IDS.map((id) => (
                <label key={id} className="parent-panel__checkbox">
                  <input
                    type="checkbox"
                    checked={policy.allowed_capabilities.includes(id)}
                    onChange={() => toggleCapability(id)}
                  />
                  {CAPABILITY_LABELS[id]}
                </label>
              ))}
            </div>
          </div>
          <button className="parent-panel__save" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      )}
    </div>
  );
}
