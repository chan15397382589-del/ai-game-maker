"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/components/SupabaseProvider";
import type { CatPlayability, CatScoreInput } from "@/lib/cat-evaluation";
import { CAT_RUBRIC } from "@/lib/cat-rubric";
import { catReviewerEmailForNumber } from "@/lib/cat-login";

type QueueItem = { id: string; anonymous_code: string; display_order: number; submitted_at: string | null; rubric_version: string };
type Assignment = {
  score: CatScoreInput & { id: string; submitted_at: string | null; display_order: number };
  artifact: { anonymous_code: string; html_code: string; html_sha256: string };
  rubric_version: string;
};

const empty: CatScoreInput = { overall_creativity: null, originality: null, design_appropriateness: null, elaboration_coherence: null, playability: null, note: "" };
export default function CatReviewerPage() {
  const [loginNumber, setLoginNumber] = useState("");
  const [password, setPassword] = useState("");
  const [reviewerCode, setReviewerCode] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [form, setForm] = useState<CatScoreInput>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("请先登录评审账号");
    const response = await fetch(path, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "请求失败");
    return body;
  }, []);

  const refresh = useCallback(async () => {
    const body = await request("/api/cat/review");
    setReviewerCode(body.reviewer_code);
    setQueue(body.data || []);
    setAuthorized(true);
  }, [request]);

  useEffect(() => {
    refresh().catch(() => setAuthorized(false)).finally(() => setLoading(false));
  }, [refresh]);

  async function login() {
    setBusy(true); setError("");
    try {
      const email = catReviewerEmailForNumber(loginNumber.trim());
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      await refresh();
      setPassword("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }

  async function openAssignment(id: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const body = await request(`/api/cat/review?assignment_id=${encodeURIComponent(id)}`);
      setAssignment(body.data);
      const score = body.data.score as CatScoreInput;
      setForm({ overall_creativity: score.overall_creativity, originality: score.originality, design_appropriateness: score.design_appropriateness, elaboration_coherence: score.elaboration_coherence, playability: score.playability, note: score.note || "" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取失败"); }
    finally { setBusy(false); }
  }

  async function save(submit: boolean) {
    if (!assignment) return;
    if (submit && !window.confirm("正式提交后不可修改。确认这份独立评分已经完成？")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("/api/cat/review", { method: "POST", body: JSON.stringify({ assignment_id: assignment.score.id, score: form, submit }) });
      setMessage(submit ? "已正式提交，评分已锁定。" : "草稿已保存。");
      setAssignment((current) => current ? { ...current, score: { ...current.score, ...form, submitted_at: result.submitted_at } } : current);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(false); }
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthorized(false); setQueue([]); setAssignment(null);
  }

  async function changePassword() {
    setError(""); setMessage("");
    if (newPassword.length < 12) { setError("新密码至少12位"); return; }
    if (newPassword !== confirmPassword) { setError("两次输入的新密码不一致"); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setNewPassword(""); setConfirmPassword(""); setShowPasswordChange(false);
      setMessage("密码已更新。请不要与其他专家共用账号。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "修改密码失败"); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800"><div className="mx-auto max-w-7xl">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">数字游戏作品独立评价</h1><p className="mt-1 text-sm text-slate-600">CAT · 每名学生一件最终作品 · 总体创造力 1–5 分</p></div>{authorized && <div className="flex items-center gap-3 text-sm"><span>评审者 {reviewerCode}</span><button onClick={() => setShowPasswordChange((value) => !value)} className="text-indigo-700 hover:underline">修改密码</button><button onClick={logout} className="text-indigo-700 hover:underline">退出登录</button></div>}</header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    {authorized && showPasswordChange && <section className="mb-5 max-w-xl rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">设置本人的独立密码</h2><p className="mt-1 text-xs text-slate-500">首次使用初始密码登录后建议立即修改；不要把密码交给其他专家。</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">新密码（至少12位）<input type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label><label className="text-sm">再次输入<input type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label></div><button disabled={busy} onClick={changePassword} className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50">保存新密码</button></section>}
    {loading ? <p>正在核验评审身份...</p> : !authorized ? <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="mb-4 font-semibold">评审者登录</h2><div className="space-y-3"><label className="block text-sm">专家登录号（1–5）<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" inputMode="numeric" maxLength={1} value={loginNumber} onChange={(e) => setLoginNumber(e.target.value)} /></label><label className="block text-sm">密码<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} /></label><button disabled={busy} onClick={login} className="w-full rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "验证中..." : "登录"}</button></div><p className="mt-4 text-xs text-slate-500">请使用研究管理员分配的独立专家账号。学生和管理员账号不能代替。</p></section> :
      <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]"><aside className="self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-2 font-semibold">待评作品</h2><p className="mb-3 text-xs text-slate-500">已提交 {queue.filter((row) => row.submitted_at).length}/{queue.length}</p><div className="max-h-[70vh] space-y-1 overflow-auto">{queue.map((row) => <button key={row.id} onClick={() => openAssignment(row.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${assignment?.score.id === row.id ? "bg-indigo-100 text-indigo-900" : "hover:bg-slate-100"}`}><span className="mr-2 text-slate-400">{row.display_order}.</span>{row.anonymous_code}<span className={`ml-2 text-xs ${row.submitted_at ? "text-green-700" : "text-amber-700"}`}>{row.submitted_at ? "已交" : "待评"}</span></button>)}{!queue.length && <p className="text-sm text-slate-500">暂无开放的评分任务。</p>}</div></aside>
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{assignment ? <><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{assignment.artifact.anonymous_code}</h2><p className="text-xs text-slate-500">量规版本：{assignment.rubric_version} · 只显示随机编号，不显示学生或组别</p></div><span className={`rounded-full px-3 py-1 text-xs ${assignment.score.submitted_at ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{assignment.score.submitted_at ? "已锁定" : "未提交"}</span></div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]"><div><iframe key={assignment.score.id} title="匿名游戏作品预览" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={assignment.artifact.html_code} className="h-[580px] w-full rounded-lg border border-slate-300" /><p className="mt-2 text-xs text-slate-500">作品在隔离预览框中运行。若无法查看或身份信息意外出现在作品内，请在评分依据中说明并联系管理员。</p></div>
            <div className="space-y-4"><div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">请先浏览同批作品建立参照，再独立评分；评审者之间不讨论具体作品。参考新颖性、设计成立性、精致性与契合性，整体判断创造力；本次只填写总体分。不能查看作品时选择“无法查看”，分数留空并写明原因。</div>
              <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-medium">查看三个判断参考角度</summary><ul className="mt-2 space-y-2 text-xs text-slate-600">{CAT_RUBRIC.slice(1).map((field) => <li key={field.key}><strong>{field.title}：</strong>{field.note}</li>)}</ul></details>
              {CAT_RUBRIC.slice(0, 1).map((field) => <fieldset key={field.key} disabled={!!assignment.score.submitted_at || form.playability === "unavailable"} className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-medium">{field.title}（{field.anchors[0].value}–{field.anchors[field.anchors.length - 1].value}）</legend><p className="mb-2 text-xs text-slate-500">{field.note}</p><div className="space-y-1">{field.anchors.map(({ value, text }) => <label key={value} className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-xs leading-relaxed ${form[field.key] === value ? "border-indigo-700 bg-indigo-50 text-indigo-900" : "border-slate-200"}`}><input type="radio" name={field.key} value={value} checked={form[field.key] === value} onChange={() => setForm((current) => ({ ...current, [field.key]: value }))} className="mt-0.5 shrink-0" /><span><strong className="mr-1">{value} 分</strong>{text}</span></label>)}</div></fieldset>)}
              <fieldset disabled={!!assignment.score.submitted_at} className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-medium">试玩状态</legend><div className="grid grid-cols-2 gap-2 text-sm">{([ ["playable", "可运行"], ["partial", "部分可运行"], ["unplayable", "无法正常运行"], ["unavailable", "无法查看作品"] ] as [CatPlayability, string][]).map(([value, label]) => <label key={value} className="flex gap-2"><input type="radio" name="playability" checked={form.playability === value} onChange={() => setForm((current) => ({ ...current, playability: value, ...(value === "unavailable" ? { overall_creativity: null, originality: null, design_appropriateness: null, elaboration_coherence: null } : {}) }))} />{label}</label>)}</div></fieldset>
              <label className="block text-sm font-medium">评分依据或无法查看的原因<textarea disabled={!!assignment.score.submitted_at} className="mt-1 h-24 w-full rounded-lg border border-slate-300 p-2 text-sm" maxLength={3000} value={form.note} onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))} placeholder="用具体作品表现支持判断；无法查看时必填" /></label>
              {!assignment.score.submitted_at && <div className="flex gap-2"><button disabled={busy} onClick={() => save(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">保存草稿</button><button disabled={busy} onClick={() => save(true)} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white hover:bg-indigo-800 disabled:opacity-50">正式提交并锁定</button></div>}
            </div></div></> : <div className="py-24 text-center text-sm text-slate-500">从左侧选择一件匿名作品开始评分。</div>}</section></div>}
  </div></main>;
}
