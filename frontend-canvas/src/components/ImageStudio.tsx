import { useEffect, useRef, useState } from "react";
import { Download, Expand, ImagePlus, LoaderCircle, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { workspaceApi } from "../api";

type Image = { id: string; prompt: string; size: string; width: number; height: number; data_url: string };
type State = { configured: boolean; deployment: string; host: string; busy: boolean; items: Image[] };
const sizes = [{ id: "square", label: "정사각형 · 1024 × 1024" }, { id: "landscape", label: "가로 · 1344 × 768" }, { id: "portrait", label: "세로 · 768 × 1344" }];

export default function ImageStudio({ consented, adult, onConsent }: { consented: boolean; adult: boolean; onConsent: (enabled: boolean) => Promise<unknown> }) {
  const [state, setState] = useState<State | null>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("square");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [approval, setApproval] = useState<{ request_id: string; prompt: string; size: string } | null>(null);
  const approvalDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const version = useRef(0);
  const generating = useRef(false);
  const current = state?.items.find(image => image.id === selection) ?? state?.items[0];
  const inProgress = busy || !!state?.busy;
  async function load() {
    const revision = version.current;
    const next = await workspaceApi<State>("/images");
    if (revision === version.current) setState(next);
  }
  useEffect(() => {
    version.current++;
    setApproval(null); setPreview(false); setState(null);
    if (!consented) setPrompt("");
    load().catch(problem => setError(String(problem)));
    return () => { version.current++; };
  }, [consented]);
  useEffect(() => {
    if (!state?.busy || busy) return;
    const timer = setTimeout(() => load().catch(problem => setError(String(problem))), 3000);
    return () => clearTimeout(timer);
  }, [state, busy]);
  useEffect(() => { if (approval) approvalDialog.current?.showModal(); else approvalDialog.current?.close(); }, [approval]);
  useEffect(() => { if (preview) previewDialog.current?.showModal(); else previewDialog.current?.close(); }, [preview]);
  async function create() {
    if (!approval || generating.current) return;
    const request = approval;
    const revision = version.current;
    generating.current = true; setApproval(null); setBusy(true); setError("");
    try {
      const result = await workspaceApi<Image>("/images", "POST", { ...request, approved: true });
      if (revision === version.current) { setSelection(result.id); await load(); }
    } catch (problem) { if (revision === version.current) setError(String(problem)); }
    finally { generating.current = false; setBusy(false); }
  }
  async function remove(image: Image) {
    try { await workspaceApi(`/images/${image.id}`, "DELETE"); await load(); }
    catch (problem) { setError(String(problem)); }
  }
  return <div className="image-studio">
    <section className="image-controls">
      <div className="section-heading"><h2><ImagePlus size={20} /> 이미지 만들기</h2><span className="mode">FLUX.2-pro</span></div>
      <label className="setting-row"><span>이미지 설명의 Azure 전송에 동의합니다.</span><input type="checkbox" className="switch" checked={consented} onChange={event => onConsent(event.target.checked)} /></label>
      <form className="stack-form" onSubmit={event => { event.preventDefault(); setApproval({ request_id: crypto.randomUUID(), prompt: prompt.trim(), size }); }}>
        <label>이미지 설명<textarea rows={7} maxLength={2000} minLength={3} required value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="빨간 자전거와 푸른 하늘, 선명한 여행 사진" /></label>
        <label>이미지 비율<select value={size} onChange={event => setSize(event.target.value)}>{sizes.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <button className="primary" type="submit" disabled={!consented || !adult || !state?.configured || inProgress || prompt.trim().length < 3}>{inProgress ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{inProgress ? "이미지 생성 중" : "생성 내용 확인"}</button>
      </form>
      {!adult && <p role="status" className="footnote">이미지 생성은 현재 성인 프로필에서만 지원합니다.</p>}
      {state && !state.configured && <p role="status" className="footnote">서버의 이미지 모델 환경 설정을 확인하세요.</p>}
      <p className="footnote">생성 시 비용이 발생할 수 있습니다. 회의·건강정보는 자동 첨부하지 않습니다. 동의를 끄면 저장 이미지와 진행 중인 결과를 폐기합니다. 이미 전송된 요청과 과금은 취소되지 않을 수 있습니다.</p>
      {error && <p role="alert" className="image-error">{error}</p>}
      <div className="image-endpoint"><span>{state?.host || "Azure 이미지 서비스"}</span><button type="button" className="icon-button" aria-label="이미지 상태 새로고침" title="이미지 상태 새로고침" onClick={() => load().catch(problem => setError(String(problem)))}><RefreshCw size={15} /></button></div>
    </section>
    <section className="image-results" aria-label="이미지 생성 결과">
      <div className="section-heading"><h2>생성 결과</h2><span className="mode">{state?.items.length ?? 0} / 3</span></div>
      <div className="image-canvas" aria-busy={inProgress}>{current ? <img src={current.data_url} alt={current.prompt} /> : <div className="image-empty"><ImagePlus size={44} strokeWidth={1} /><strong>{inProgress ? "이미지를 생성하고 있습니다" : "아직 생성한 이미지가 없습니다"}</strong></div>}{inProgress && <div className="image-progress" role="status"><LoaderCircle size={17} className="spin" /> 생성 중</div>}</div>
      {current && <><div className="image-result-tools"><span>{current.width} × {current.height}</span><div className="toolbar"><button className="icon-button" aria-label="이미지 확대" title="이미지 확대" onClick={() => setPreview(true)}><Expand size={18} /></button><a className="image-download" href={current.data_url} download={`guardian-${current.id}.${current.data_url.startsWith("data:image/jpeg") ? "jpg" : "png"}`}><Download size={16} />다운로드</a><button className="icon-button" aria-label="이미지 삭제" title="이미지 삭제" onClick={() => remove(current)}><Trash2 size={17} /></button></div></div><p className="image-caption">{current.prompt}</p></>}
      <div className="image-thumbnails">{state?.items.map((image, index) => <button key={image.id} aria-label={`생성 이미지 ${index + 1} 선택`} aria-pressed={current?.id === image.id} onClick={() => setSelection(image.id)}><img src={image.data_url} alt="" /></button>)}</div>
      <p className="footnote">최근 3장만 현재 세션에 보관합니다. 서버 재시작·세션 삭제·만료 시 사라집니다. 다운로드한 파일은 별도 보관됩니다.</p>
    </section>
    {approval && <dialog ref={approvalDialog} className="modal" aria-label="이미지 생성 승인" onCancel={() => setApproval(null)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setApproval(null); } }}><div className="modal-heading"><h2>이미지를 생성할까요?</h2><button className="icon-button" aria-label="생성 승인 닫기" onClick={() => setApproval(null)}><X size={18} /></button></div><p className="image-caption">{approval.prompt}</p><dl className="approval-fields"><dt>모델</dt><dd>{state?.deployment}</dd><dt>크기</dt><dd>{sizes.find(option => option.id === approval.size)?.label}</dd><dt>전송 대상</dt><dd>{state?.host}</dd><dt>전달 데이터</dt><dd>설명, 크기, 배포 이름</dd></dl><p className="footnote">1장을 생성하며 Azure 사용량에 따라 과금됩니다. 자동 재시도는 하지 않습니다.</p><button className="primary" onClick={create} disabled={inProgress || !consented}><Sparkles size={17} />승인하고 이미지 생성</button></dialog>}
    {preview && current && <dialog ref={previewDialog} className="modal image-lightbox" aria-label="생성 이미지 확대" onCancel={() => setPreview(false)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setPreview(false); } }}><div className="modal-heading"><h2>생성 이미지</h2><button className="icon-button" aria-label="이미지 확대 닫기" onClick={() => setPreview(false)}><X size={18} /></button></div><img src={current.data_url} alt={current.prompt} /></dialog>}
  </div>;
}