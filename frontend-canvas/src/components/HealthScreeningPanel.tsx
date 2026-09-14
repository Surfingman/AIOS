import { useEffect, useRef, useState } from "react";
import { X, Upload, Heart } from "lucide-react";
import { confirmHealthScreening, uploadHealthScreening } from "../api";
import type { CapabilityResult } from "../types";

interface Measurement {
  label: string;
  value: number;
  unit: string;
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function HealthScreeningPanel({
  sessionId,
  onResult,
}: {
  sessionId: string;
  onResult: (result: CapabilityResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [measurements, setMeasurements] = useState<Record<string, Measurement>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({ allergies: "", conditions: "", medications: "", injuries: "" });
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMeasurements({});
    setNotice("검진 결과를 읽고 있습니다...");
    try {
      const response = await uploadHealthScreening(sessionId, file);
      setMeasurements(response.card.measurements ?? {});
      setNotice(response.card.notice ?? "추출 결과를 확인해 주세요.");
      setOpen(true);
    } catch (error) {
      setNotice(String(error));
      setOpen(true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirm() {
    if (Object.values(measurements).some(item => !Number.isFinite(item.value) || item.value < 0)) {
      setNotice("모든 검진값에 유효한 숫자를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const response = await confirmHealthScreening(sessionId, {
        measurements,
        allergies: csv(details.allergies),
        conditions: csv(details.conditions),
        medications: csv(details.medications),
        injuries: csv(details.injuries),
        preferences: { daily_minutes: 30 },
      });
      onResult({ capability: "health", action: "wellness_program", status: "ok", card: response.card });
      setOpen(false);
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="health-panel">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.txt"
        hidden
        onChange={(event) => upload(event.target.files?.[0])}
      />
      <button className="health-panel__toggle" onClick={() => measurements && setOpen(!open)} type="button">
        <Heart size={15} />건강검진
      </button>
      <button className="health-panel__upload" onClick={() => inputRef.current?.click()} disabled={busy} type="button">
        <Upload size={15} />업로드
      </button>
      {open && (
        <dialog ref={dialogRef} className="modal health-dialog" onCancel={() => setOpen(false)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); } }} aria-label="건강검진 결과 확인">
          <div className="modal-heading"><h2>건강검진 결과 확인</h2><button type="button" className="icon-button" aria-label="검진 확인 닫기" onClick={() => setOpen(false)}><X size={18} /></button></div>
          <div className="health-panel__notice">{notice || "PDF, JPG, PNG 또는 TXT 결과지를 업로드하세요."}</div>
          {Object.entries(measurements).map(([key, item]) => (
            <label className="health-panel__measurement" key={key}>
              <span>{item.label}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={Number.isFinite(item.value) ? item.value : ""}
                onChange={(event) => setMeasurements((current) => ({
                  ...current,
                  [key]: { ...item, value: event.target.value === "" ? NaN : Number(event.target.value) },
                }))}
              />
              <span>{item.unit}</span>
            </label>
          ))}
          {(["allergies", "conditions", "medications", "injuries"] as const).map((key) => (
            <label className="health-panel__field" key={key}>
              <span>{{ allergies: "알레르기", conditions: "질환", medications: "복용 약물", injuries: "부상" }[key]}</span>
              <input
                value={details[key]}
                placeholder="쉼표로 구분"
                onChange={(event) => setDetails({ ...details, [key]: event.target.value })}
              />
            </label>
          ))}
          <button className="health-panel__confirm" onClick={confirm} disabled={busy || !Object.keys(measurements).length} type="button">
            확인하고 프로그램 만들기
          </button>
        </dialog>
      )}
    </div>
  );
}