"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/components/SupabaseProvider";

type Batch = { id: string; name: string; grade: number; task_label: string; status: "draft" | "open" | "closed"; rubric_version: string; created_at: string };
type Reviewer = { id: string; reviewer_code: string; expert_name: string | null; email: string; auth_available: boolean; auth_user_id: string };
type Student = { id: string; name: string; student_id: string; class_num: number | null; srl_condition: string | null };
type Candidate = { source_type: "projects" | "conversations" | "game_snapshots"; source_id: string; user_id: string; game_title: string; created_at: string; content_at: string; is_published?: boolean };
type Artifact = { id: string; student_user_id: string; student_code: string; anonymous_code: string; source_type: string; source_record_id: string | null; html_sha256: string; frozen_at: string };
type Overview = {
  batches: Batch[];
  reviewers: Reviewer[];
  batch?: Batch;
  students?: Student[];
  candidates?: Candidate[];
  artifacts?: Artifact[];
  batchReviewers?: { reviewer_id: string }[];
  reviewerProgress?: Record<string, { assigned: number; submitted: number }>;
  scoreCount?: number;
  submittedCount?: number;
};
type Preview = { source_type: string; source_id: string; game_title: string; student_code: string; html_code: string; html_sha256: string; created_at: string; content_at: string };

function candidateKey(candidate: Candidate): string { return `${candidate.source_type}:${candidate.source_id}`; }
function candidateParts(value: string) { const index = value.indexOf(":"); return { source_type: value.slice(0, index), source_id: value.slice(index + 1) }; }
const sourceName: Record<Candidate["source_type"], string> = { projects: "正式提交", conversations: "会话当前版", game_snapshots: "历史快照" };

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("请先以管理员身份登录");
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败（${response.status}）`);
  }
  return response.json();
}

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none";
const primary = "rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export default function CatAdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(3);
  const [taskLabel, setTaskLabel] = useState("数字游戏最终作品");
  const [reviewerNumber, setReviewerNumber] = useState("");
  const [expertName, setExpertName] = useState("");
  const [reviewerPassword, setReviewerPassword] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [nameCorrections, setNameCorrections] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [selectionNotes, setSelectionNotes] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewedCandidateKey, setPreviewedCandidateKey] = useState("");
  const [previewedHash, setPreviewedHash] = useState("");

  const load = useCallback(async (id?: string) => {
    const next = await api(`/api/admin/cat${id ? `?batch_id=${encodeURIComponent(id)}` : ""}`) as Overview;
    setOverview(next);
    if (!id && next.batches.length) setBatchId((current) => current || next.batches[0].id);
  }, []);

  useEffect(() => {
    load(batchId || undefined).catch((cause) => setError(cause.message));
  }, [batchId, load]);

  async function act(action: string, payload: Record<string, unknown>, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api("/api/admin/cat", { method: "POST", body: JSON.stringify({ action, ...payload }) });
      if (result.batchId) setBatchId(result.batchId);
      await load(result.batchId || batchId || undefined);
      setMessage(action === "freeze_artifact" ? `作品已冻结，匿名编号：${result.anonymous_code}` : "操作已完成");
      if (action === "freeze_artifact") { setPreviewedCandidateKey(""); setPreviewedHash(""); }
      if (action === "add_reviewer" || action === "remove_reviewer") setSelectedReviewer("");
      if (action === "register_reviewer") { setReviewerPassword(""); setReviewerNumber(""); setExpertName(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally { setBusy(false); }
  }

  const current = overview?.batch;
  const frozenIds = useMemo(() => new Set((overview?.artifacts || []).map((row) => row.student_user_id)), [overview]);
  const selectedReviewers = new Set((overview?.batchReviewers || []).map((row) => row.reviewer_id));
  const candidateMap = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const candidate of overview?.candidates || []) map.set(candidate.user_id, [...(map.get(candidate.user_id) || []), candidate]);
    for (const rows of map.values()) rows.sort((a, b) => b.content_at.localeCompare(a.content_at));
    return map;
  }, [overview]);

  async function showPreview(key: string) {
    setError("");
    const source = candidateParts(key);
    try { const result = await api(`/api/admin/cat?batch_id=${batchId}&source_type=${source.source_type}&source_id=${encodeURIComponent(source.source_id)}`); setPreview(result); setPreviewedCandidateKey(key); setPreviewedHash(result.html_sha256); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "预览失败"); }
  }

  async function exportCsv(kind: "raw" | "summary" | "reviewers") {
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录");
      const response = await fetch(`/api/admin/cat/export?batch_id=${batchId}&kind=${kind}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error((await response.json()).error || "导出失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `CAT_${kind}_${batchId}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败"); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><button onClick={() => router.push("/admin")} className="mb-3 text-sm text-indigo-700 hover:underline">← 返回教师后台</button>
          <h1 className="text-2xl font-semibold">最终作品创造力评价</h1>
          <p className="mt-1 text-sm text-slate-600">每名学生每批一件作品；总体创造力 1–5 分，由 3–5 位专家独立盲评。</p></div>
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">本模块不修改原始作品、对话或学生分组。冻结前须核实作品来源与版本。</div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className={card}><h2 className="mb-3 font-semibold">创建评分批次</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_100px_1fr]">
            <label className="text-sm">批次名称<input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：三年级期末作品" /></label>
            <label className="text-sm">年级<input type="number" min="1" max="12" className={input} value={grade} onChange={(e) => setGrade(Number(e.target.value))} /></label>
            <label className="text-sm">任务名称<input className={input} value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} /></label>
          </div><button disabled={busy} className={`${primary} mt-3`} onClick={() => act("create_batch", { name, grade, task_label: taskLabel })}>创建批次</button>
        </section>
        <section className={card}><h2 className="mb-3 font-semibold">一位专家一个账号</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">专家登录号<select className={input} value={reviewerNumber} onChange={(e) => setReviewerNumber(e.target.value)}><option value="">选择 1–5</option>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
            <label className="text-sm">专家真实姓名（可稍后补录）<input className={input} value={expertName} onChange={(e) => setExpertName(e.target.value)} placeholder="未核实前留空" /></label>
            <label className="text-sm">初始密码（至少12位）<input type="password" className={input} value={reviewerPassword} onChange={(e) => setReviewerPassword(e.target.value)} /></label>
          </div><p className="mt-2 text-xs text-slate-500">登录号 1–5 对应独立的内部 Auth 身份，不需要邮箱。正式分配评分前必须补录并核实真实姓名；初始密码请分别交付。评审入口：/cat/review。</p>
          <button disabled={busy || !reviewerNumber || reviewerPassword.length < 12} className={`${primary} mt-3`} onClick={() => act("register_reviewer", { expert_name: expertName, login_number: reviewerNumber, password: reviewerPassword })}>创建专家账号</button>
        </section>
      </div>
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">当前批次</h2>
          <select className={`${input} max-w-sm`} value={batchId} onChange={(e) => { setBatchId(e.target.value); setPreviewedCandidateKey(""); setPreviewedHash(""); setPreview(null); }}><option value="">选择批次</option>{overview?.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.status}</option>)}</select>
          {current && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{current.rubric_version} · {current.status}</span>}
        </div>
        {current && <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span>已冻结作品：{overview?.artifacts?.length || 0}</span>{current.status === "draft" && <span className="text-amber-800">同年级未冻结：{(overview?.students?.length || 0) - (overview?.artifacts?.length || 0)}（须逐人核查）</span>}<span>已选专家：{overview?.batchReviewers?.length || 0}</span>
          <span>已提交评分：{overview?.submittedCount || 0}/{overview?.scoreCount || 0}</span>
          <button disabled={current.status !== "closed"} title={current.status !== "closed" ? "批次结束后导出" : ""} className={secondary} onClick={() => exportCsv("raw")}>导出专家原始评分 CSV</button>
          <button disabled={current.status !== "closed"} title={current.status !== "closed" ? "批次结束后导出" : ""} className={secondary} onClick={() => exportCsv("summary")}>导出学生汇总 CSV</button>
          <button disabled={current.status !== "closed"} title={current.status !== "closed" ? "批次结束后导出；包含专家个人信息，请单独保管" : "包含专家个人信息，请单独保管"} className={secondary} onClick={() => exportCsv("reviewers")}>导出专家账号索引 CSV</button>
          {current.status === "draft" && <button disabled={busy} className={primary} onClick={() => act("open_batch", { batch_id: batchId }, `同年级还有 ${(overview?.students?.length || 0) - (overview?.artifacts?.length || 0)} 人未冻结作品。请确认已逐人核查未纳入的原因，并核实已冻结作品的来源、版本与匿名化风险。开放后不能修改作品和评审任务。`) }>开放盲评</button>}
          {current.status === "open" && <button disabled={busy} className={primary} onClick={() => act("close_batch", { batch_id: batchId }, "确认所有评分均已提交并结束本批次？")}>结束评分</button>}
        </div>}
      </section>
      <section className={card}><h2 className="font-semibold">专家账号与独立评分进度</h2><p className="mt-1 text-xs text-slate-500">姓名、邮箱和账号关联仅管理员可见；专家端只显示本人编号及自己被分配的作品。</p>
        <div className="mt-3 overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-2">编号</th><th className="p-2">专家</th><th className="p-2">登录号</th><th className="p-2">账号状态</th><th className="p-2">当前批次</th><th className="p-2">提交进度</th></tr></thead><tbody>{overview?.reviewers.map((reviewer) => {
          const progress = overview.reviewerProgress?.[reviewer.id];
          return <tr key={reviewer.id} className="border-b border-slate-100"><td className="p-2">{reviewer.reviewer_code}</td><td className="p-2">{reviewer.expert_name || <div className="flex gap-1"><input className={`${input} max-w-28`} aria-label={`${reviewer.reviewer_code} 专家姓名`} placeholder="补录姓名" value={nameCorrections[reviewer.id] || ""} onChange={(e) => setNameCorrections((values) => ({ ...values, [reviewer.id]: e.target.value }))} /><button disabled={busy || (nameCorrections[reviewer.id] || "").trim().length < 2} className="text-indigo-700 disabled:text-slate-400" onClick={() => act("update_reviewer_name", { reviewer_id: reviewer.id, expert_name: nameCorrections[reviewer.id] })}>保存</button></div>}</td><td className="p-2">{reviewer.email.match(/^cat-reviewer-([1-5])@vibeclassroom\.invalid$/)?.[1] || reviewer.email}</td><td className="p-2">{reviewer.auth_available ? "可登录" : <span className="text-red-700">需核查</span>}</td><td className="p-2">{current ? selectedReviewers.has(reviewer.id) ? "已分配" : "未分配" : "—"}</td><td className="p-2">{progress?.assigned ? `${progress.submitted}/${progress.assigned}` : "—"}</td></tr>;
        })}{!overview?.reviewers.length && <tr><td colSpan={6} className="p-4 text-slate-500">尚未创建专家账号</td></tr>}</tbody></table></div>
      </section>
      {current?.status === "draft" && <>
        <section className={card}><h2 className="font-semibold">分配评审者</h2>
          <p className="mt-1 text-sm text-slate-500">正式评分至少 3 位、最多 5 位；已加入：{overview?.reviewers.filter((r) => selectedReviewers.has(r.id)).map((r) => r.reviewer_code).join("、") || "无"}</p>
          <div className="mt-2 flex flex-wrap gap-2">{overview?.reviewers.filter((r) => selectedReviewers.has(r.id)).map((r) => <span key={r.id} className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-900">{r.reviewer_code} · {r.expert_name || "待补录实名"}<button disabled={busy} className="text-red-700 hover:underline disabled:opacity-50" onClick={() => act("remove_reviewer", { batch_id: batchId, reviewer_id: r.id }, `从尚未开放的批次移除专家 ${r.expert_name || r.reviewer_code}（${r.reviewer_code}）？账号本身与其他批次不受影响。`)}>移除</button></span>)}</div>
          <div className="mt-3 flex flex-wrap gap-2"><select className={`${input} max-w-xs`} value={selectedReviewer} onChange={(e) => setSelectedReviewer(e.target.value)}><option value="">选择专家</option>{overview?.reviewers.filter((r) => !selectedReviewers.has(r.id)).map((r) => <option key={r.id} value={r.id} disabled={!r.expert_name || !r.auth_available}>{r.reviewer_code}{r.expert_name ? ` · ${r.expert_name}` : " · 待补录实名"}{!r.auth_available ? " · 账号不可用" : ""}</option>)}</select>
            <button disabled={busy || !selectedReviewer} className={secondary} onClick={() => act("add_reviewer", { batch_id: batchId, reviewer_id: selectedReviewer })}>加入批次</button></div>
        </section>
        <section className={card}><h2 className="font-semibold">逐人核实最终作品</h2>
          <p className="mt-1 text-sm text-slate-500">不能仅按时间自动选择。预览后确认这是学生实际提交的最终版；无可确认作品者保留为缺失，不补造。</p>
          <div className="mt-4 max-h-[650px] overflow-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">学生</th><th className="p-2">班级/组别</th><th className="p-2">候选游戏版本</th><th className="p-2">核实依据</th><th className="p-2">状态/操作</th></tr></thead><tbody>
            {overview?.students?.map((student) => { const candidates = candidateMap.get(student.id) || []; const frozen = frozenIds.has(student.id); return <tr key={student.id} className="border-b border-slate-100">
              <td className="p-2">{student.student_id}<br/><span className="text-xs text-slate-500">{student.name}</span></td>
              <td className="p-2">{student.class_num ?? "—"}班 / {student.srl_condition || "未记录"}</td>
              <td className="p-2"><select disabled={frozen} className={input} value={choices[student.id] || ""} onChange={(e) => { setChoices((v) => ({ ...v, [student.id]: e.target.value })); setPreviewedCandidateKey(""); setPreviewedHash(""); }}><option value="">{candidates.length ? `选择候选版本（${candidates.length}件）` : "未检出游戏HTML，仍需核查"}</option>{candidates.map((candidate) => <option key={candidateKey(candidate)} value={candidateKey(candidate)}>{sourceName[candidate.source_type]} · {candidate.source_id} · {candidate.game_title} · {new Date(candidate.content_at).toLocaleString("zh-CN")}</option>)}</select></td>
              <td className="p-2"><input disabled={frozen} className={input} value={selectionNotes[student.id] || ""} onChange={(e) => setSelectionNotes((v) => ({ ...v, [student.id]: e.target.value }))} placeholder="例：核对提交时间和课堂记录" /></td>
              <td className="p-2 whitespace-nowrap">{frozen ? <span className="text-green-700">已冻结</span> : choices[student.id] ? <div className="flex gap-2"><button className="text-indigo-700 hover:underline" onClick={() => showPreview(choices[student.id])}>预览</button><button disabled={busy || !previewedHash || previewedCandidateKey !== choices[student.id] || (selectionNotes[student.id] || "").trim().length < 6} title={previewedCandidateKey !== choices[student.id] ? "请先预览当前选中的作品" : (selectionNotes[student.id] || "").trim().length < 6 ? "请填写至少6字的选择依据" : ""} className="text-indigo-700 hover:underline disabled:text-slate-400" onClick={() => act("freeze_artifact", { batch_id: batchId, ...candidateParts(choices[student.id]), expected_sha256: previewedHash, selection_note: selectionNotes[student.id] || "", confirm_student_submission: true }, `确认 ${student.student_id} 的作品 ${choices[student.id]} 是该学生实际提交的最终版本？冻结后不可替换。`)}>核实并冻结</button></div> : <span className="text-slate-400">待核实</span>}</td>
            </tr>; })}
          </tbody></table></div>
          <p className="mt-3 text-xs text-slate-500">候选来自正式提交、会话当前版和历史快照。会话或快照中的HTML仅证明存在代码版本；须结合课堂记录核实是否为学生最终作品，不能按最新时间自动认定。</p>
        </section>
      </>}
    </div>
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="候选作品预览"><div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold">{preview.game_title} · {preview.student_code}</h2><p className="break-all text-xs text-slate-500">来源：{preview.source_type}:{preview.source_id} · 记录创建：{preview.created_at} · 内容时间：{preview.content_at} · SHA-256：{preview.html_sha256}</p></div><button className={secondary} onClick={() => setPreview(null)}>关闭</button></div>
      <iframe title="仅供管理员核实的作品预览" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview.html_code} className="min-h-0 flex-1 rounded-lg border border-slate-300" />
      <p className="mt-2 text-xs text-amber-800">检查作品内是否含姓名、班级或组别。冻结快照保留原始 HTML，不会自动清除这些标识。</p>
    </div></div>}
  </main>;
}
