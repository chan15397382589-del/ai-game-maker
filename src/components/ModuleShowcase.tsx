"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";
import VoiceButton from "@/components/VoiceButton";
import { trackEvent } from "@/utils/trackEvent";
import { injectGameCSS } from "@/utils/gamePreview";

interface Props {
  userId: string;
}

interface SharedItem {
  id: number;
  user_id: string;
  game_title: string;
  html_code: string;
  author?: { name: string; student_id: string };
}

interface PeerReview {
  id: number;
  reviewer_id: string;
  reviewee_id: string;
  shared_item_id: number;
  q1_enjoy: string;
  q2_suggestion: string;
  q3_bug: string;
  created_at: string;
  reviewer?: { name: string; student_id: string };
}

export default function ModuleShowcase({ userId }: Props) {
  const [activeTab, setActiveTab] = useState<"review" | "myreviews">("review");
  const [tasks, setTasks] = useState<SharedItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [myReviews, setMyReviews] = useState<PeerReview[]>([]);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);

  // 每个评价任务的草稿（按 task_index 存储）
  const [drafts, setDrafts] = useState<Record<number, { q1: string; q2: string; q3: string }>>({});
  const currentDraft = drafts[currentIdx] || { q1: "", q2: "", q3: "" };

  const setQ1 = (val: string | ((prev: string) => string)) => setDrafts((prev) => {
    const existing = prev[currentIdx] || { q1: "", q2: "", q3: "" };
    const newVal = typeof val === "function" ? val(existing.q1) : val;
    return { ...prev, [currentIdx]: { ...existing, q1: newVal } };
  });
  const setQ2 = (val: string | ((prev: string) => string)) => setDrafts((prev) => {
    const existing = prev[currentIdx] || { q1: "", q2: "", q3: "" };
    const newVal = typeof val === "function" ? val(existing.q2) : val;
    return { ...prev, [currentIdx]: { ...existing, q2: newVal } };
  });
  const setQ3 = (val: string | ((prev: string) => string)) => setDrafts((prev) => {
    const existing = prev[currentIdx] || { q1: "", q2: "", q3: "" };
    const newVal = typeof val === "function" ? val(existing.q3) : val;
    return { ...prev, [currentIdx]: { ...existing, q3: newVal } };
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/peer-reviews?mode=tasks", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setTotalReviewed(data.totalReviewed || 0);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchMyReviews = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/peer-reviews?mode=my_reviews", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMyReviews(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleSubmitReview = async () => {
    if (!currentDraft.q1.trim() || !currentDraft.q2.trim()) { alert("请至少填写前两个问题"); return; }
    const task = tasks[currentIdx];
    if (!task) return;

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/peer-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewee_id: task.user_id, shared_item_id: task.id, q1_enjoy: currentDraft.q1.trim(), q2_suggestion: currentDraft.q2.trim(), q3_bug: currentDraft.q3.trim() }),
      });

      if (res.ok) {
        trackEvent("peer_review_submit", undefined, { revieweeId: task.user_id, itemId: task.id });
        setGameStarted(false);
        const newTotal = totalReviewed + 1;
        setTotalReviewed(newTotal);

        // 最后一个评价完成后，跳转到游戏设计模块
        if (currentIdx >= tasks.length - 1) {
          alert("✅ 所有评价已完成！即将跳转到班级作品页面，看看同学们的游戏吧！");
          localStorage.setItem("gotoModule", "gallery");
          window.location.href = "/student?module=gallery";
        } else {
          // 自动跳到下一个
          setCurrentIdx(currentIdx + 1);
          alert("✅ 评价已提交！继续评价下一位同学。");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "提交失败");
      }
    } catch { alert("提交失败，请重试"); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* 标签切换 */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setActiveTab("review")} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${activeTab === "review" ? "bg-indigo-500 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>
           评价他人的作品 {totalReviewed > 0 && <span className="ml-1 bg-white/20 px-1.5 py-0.5 rounded text-xs">已评 {totalReviewed}</span>}
        </button>
        <button onClick={() => { setActiveTab("myreviews"); fetchMyReviews(); }} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${activeTab === "myreviews" ? "bg-green-500 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>
           查看我的评价
        </button>
      </div>

      {/* 评价他人的作品 */}
      {activeTab === "review" && (
        tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
              <span className="text-5xl"> </span>
            </div>
            <p className="text-2xl font-bold text-gray-800 mb-2">暂无可评价的游戏</p>
            <p className="text-gray-500 mb-6">请等待同学分享游戏后再来</p>
            <button onClick={fetchTasks} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition shadow-md">刷新</button>
          </div>
        ) : (() => {
          const current = tasks[currentIdx];
          return (
            <div className="flex-1 flex gap-4 min-h-0">
              {/* 左侧：游戏预览 */}
              <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{current.game_title || "未命名游戏"}</p>
                    <p className="text-xs text-indigo-100">作者：{current.author?.name || "未知"}</p>
                  </div>
                  {/* 可点击的进度指示器 */}
                  <div className="flex gap-2">
                    {tasks.map((task, i) => (
                      <button key={i} onClick={() => { setCurrentIdx(i); setGameStarted(false); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                          i === currentIdx ? "bg-white text-indigo-600 scale-110" : "bg-white/30 text-white hover:bg-white/50"
                        }`}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 relative bg-black overflow-hidden">
                  {gameStarted ? (
                    <iframe
                      srcDoc={injectGameCSS(current.html_code)}
                      className="absolute inset-0 w-full h-full"
                      sandbox="allow-scripts"
                      scrolling="no"
                      style={{ border: "none" }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 cursor-pointer" onClick={() => { setGameStarted(true); trackEvent("review_game_start", undefined, { itemId: current.id }); }}>
                      <div className="text-center">
                        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                          <span className="text-4xl ml-1">▶️</span>
                        </div>
                        <p className="text-xl font-bold text-white">点击试玩游戏</p>
                        <p className="text-sm text-indigo-200 mt-1">先玩再评价</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：评价表单 */}
              <div className="w-96 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-green-500 to-emerald-500">
                  <h3 className="text-base font-bold text-white">  评价这个游戏</h3>
                  <p className="text-xs text-green-100">认真回答，帮助同学改进游戏</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <label className="text-sm font-bold text-gray-800">哪里最好玩？</label>
                    </div>
                    <div className="flex gap-2">
                      <textarea value={currentDraft.q1} onChange={(e) => setQ1(e.target.value)} placeholder="比如：画面很酷、玩法有趣..." rows={2} className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-green-400 resize-none transition" />
                      <VoiceButton onResult={(text) => setQ1((prev) => prev + text)} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <label className="text-sm font-bold text-gray-800">有什么建议？</label>
                    </div>
                    <div className="flex gap-2">
                      <textarea value={currentDraft.q2} onChange={(e) => setQ2(e.target.value)} placeholder="比如：加点音乐、难度调整..." rows={2} className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 resize-none transition" />
                      <VoiceButton onResult={(text) => setQ2((prev) => prev + text)} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <label className="text-sm font-bold text-gray-800">发现问题了吗？<span className="text-gray-400 font-normal">（可选）</span></label>
                    </div>
                    <div className="flex gap-2">
                      <textarea value={currentDraft.q3} onChange={(e) => setQ3(e.target.value)} placeholder="比如：按钮点不到、角色会穿墙..." rows={2} className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none transition" />
                      <VoiceButton onResult={(text) => setQ3((prev) => prev + text)} />
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-gray-100">
                  <button onClick={handleSubmitReview} disabled={submitting || !currentDraft.q1.trim() || !currentDraft.q2.trim()} className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-bold transition shadow-md">
                    {submitting ? "提交中..." : currentIdx < tasks.length - 1 ? "提交并评价下一个 →" : "提交完成，查看我的评价 ✅"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* 查看我的评价 */}
      {activeTab === "myreviews" && (
        myReviews.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <span className="text-5xl"> </span>
            </div>
            <p className="text-xl font-bold text-gray-700 mb-2">还没有同学评价你的游戏</p>
            <p className="text-gray-500">完成 3 个评价后可以查看</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pb-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
              <div className="w-10 h-10"><XiaozhiAvatar state="success" /></div>
              <div>
                <p className="text-sm font-bold text-green-700">共有 {myReviews.length} 位同学评价了你的游戏</p>
                <p className="text-xs text-green-600">认真看看同学的建议，继续改进！</p>
              </div>
            </div>
            {myReviews.map((review, idx) => (
              <div key={review.id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-100">
                  <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold">{idx + 1}</div>
                  <span className="text-sm font-bold text-gray-800">同学 {idx + 1}</span>
                  <span className="text-xs text-gray-400 ml-auto">{new Date(review.created_at).toLocaleString("zh-CN")}</span>
                </div>
                <div className="p-5 space-y-3">
                  <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                    <p className="text-xs font-bold text-green-700 mb-1">  哪里最好玩</p>
                    <p className="text-sm text-green-900">{review.q1_enjoy}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 mb-1">  改进建议</p>
                    <p className="text-sm text-blue-900">{review.q2_suggestion}</p>
                  </div>
                  {review.q3_bug && (
                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <p className="text-xs font-bold text-orange-700 mb-1">  发现的问题</p>
                      <p className="text-sm text-orange-900">{review.q3_bug}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
