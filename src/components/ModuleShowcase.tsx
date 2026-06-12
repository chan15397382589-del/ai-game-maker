"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";
import VoiceButton from "@/components/VoiceButton";

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
  item?: { game_title: string; html_code: string };
}

type Phase = "selecting" | "reviewing" | "viewing";

export default function ModuleShowcase({ userId }: Props) {
  const [phase, setPhase] = useState<Phase>("selecting");
  const [tasks, setTasks] = useState<SharedItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [myReviews, setMyReviews] = useState<PeerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);

  // 评价表单
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 加载评价任务
  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/peer-reviews?mode=tasks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        if (data.totalReviewed >= 3 || (data.tasks || []).length === 0) {
          // 已完成评价或没有可评价的游戏，查看自己的评价
          fetchMyReviews();
        }
      }
    } catch {} finally { setLoading(false); }
  };

  const fetchMyReviews = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/peer-reviews?mode=my_reviews", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMyReviews(await res.json());
        setPhase("viewing");
      }
    } catch {}
  };

  const handleSubmitReview = async () => {
    if (!q1.trim() || !q2.trim()) {
      alert("请至少填写前两个问题");
      return;
    }

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
        body: JSON.stringify({
          reviewee_id: task.user_id,
          shared_item_id: task.id,
          q1_enjoy: q1.trim(),
          q2_suggestion: q2.trim(),
          q3_bug: q3.trim(),
        }),
      });

      if (res.ok) {
        // 清空表单
        setQ1(""); setQ2(""); setQ3(""); setGameStarted(false);

        if (currentIdx < tasks.length - 1) {
          // 还有下一个游戏
          setCurrentIdx(currentIdx + 1);
        } else {
          // 全部评价完成，查看自己的评价
          fetchMyReviews();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "提交失败");
      }
    } catch { alert("提交失败，请重试"); }
    finally { setSubmitting(false); }
  };

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-gray-400 animate-pulse">加载中...</p>
      </div>
    );
  }

  // 阶段1：选择游戏（自动完成，直接进入评价）
  if (phase === "selecting") {
    if (tasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center">
          <p className="text-6xl mb-4"> </p>
          <p className="text-xl font-bold text-gray-700 mb-2">暂无可评价的游戏</p>
          <p className="text-gray-500">请等待同学分享游戏后再来</p>
          <button onClick={fetchTasks} className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm">刷新</button>
        </div>
      );
    }
    // 自动进入评价阶段
    setPhase("reviewing");
    return null;
  }

  // 阶段2：评价游戏
  if (phase === "reviewing") {
    const current = tasks[currentIdx];
    if (!current) return null;

    return (
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* 顶部进度 */}
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="flex items-center gap-2">
            <XiaozhiAvatar state="idle" />
            <div>
              <p className="text-sm font-bold text-gray-800">小智老师</p>
              <p className="text-xs text-gray-500">请认真评价同学的游戏，帮助他改进！</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {tasks.map((_, i) => (
              <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                i < currentIdx ? "bg-green-500 text-white" :
                i === currentIdx ? "bg-indigo-500 text-white" :
                "bg-gray-200 text-gray-500"
              }`}>{i + 1}</div>
            ))}
          </div>
        </div>

        {/* 主体：左游戏 右评价 */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* 左侧：游戏预览 */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-bold text-gray-800">{current.game_title || "未命名游戏"}</p>
              <p className="text-xs text-gray-500">作者：{current.author?.name || "未知"}</p>
            </div>
            <div className="flex-1 relative">
              {gameStarted ? (
                <iframe
                  srcDoc={current.html_code}
                  className="w-full h-full"
                  sandbox="allow-scripts allow-same-origin"
                  scrolling="no"
                  style={{ border: "none" }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 cursor-pointer" onClick={() => setGameStarted(true)}>
                  <div className="text-center">
                    <div className="text-7xl mb-4 animate-bounce">▶️</div>
                    <p className="text-2xl font-bold text-indigo-600">点击试玩游戏</p>
                  </div>
                </div>
              )}
              {gameStarted && (
                <button onClick={() => setGameStarted(false)} className="absolute top-3 right-3 bg-white/90 hover:bg-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm border border-gray-200">  重新开始</button>
              )}
            </div>
          </div>

          {/* 右侧：评价表单 */}
          <div className="w-96 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-indigo-50">
              <h3 className="text-base font-bold text-indigo-700">  评价这个游戏</h3>
              <p className="text-xs text-indigo-500">认真回答，帮助同学改进游戏</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">1. 你觉得这个游戏哪里最好玩？</label>
                <div className="flex gap-2">
                  <textarea value={q1} onChange={(e) => setQ1(e.target.value)} placeholder="比如：画面很酷、玩法有趣..." rows={2} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none" />
                  <VoiceButton onResult={(text) => setQ1((prev) => prev + text)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">2. 你有什么建议让游戏更好？</label>
                <div className="flex gap-2">
                  <textarea value={q2} onChange={(e) => setQ2(e.target.value)} placeholder="比如：加点音乐、难度调整..." rows={2} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none" />
                  <VoiceButton onResult={(text) => setQ2((prev) => prev + text)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">3. 你发现什么问题了吗？（可选）</label>
                <div className="flex gap-2">
                  <textarea value={q3} onChange={(e) => setQ3(e.target.value)} placeholder="比如：按钮点不到、角色会穿墙..." rows={2} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none" />
                  <VoiceButton onResult={(text) => setQ3((prev) => prev + text)} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100">
              <button onClick={handleSubmitReview} disabled={submitting || !q1.trim() || !q2.trim()} className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-bold transition">
                {submitting ? "提交中..." : currentIdx < tasks.length - 1 ? "提交并评价下一个 →" : "提交完成 ✅"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 阶段3：查看我的评价
  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <XiaozhiAvatar state="success" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">  同学给你的评价</h2>
            <p className="text-xs text-gray-500">认真看看同学的建议，继续改进你的游戏！</p>
          </div>
        </div>
        <button onClick={() => { localStorage.setItem("gotoModule", "create"); window.location.href = "/student?module=create"; }} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition">  继续修改游戏</button>
      </div>

      {myReviews.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <p className="text-6xl mb-4"> </p>
            <p className="text-gray-500">还没有同学评价你的游戏</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4">
          {myReviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-gray-800">{review.reviewer?.name || "匿名"}</span>
                <span className="text-xs text-gray-400">{review.reviewer?.student_id}</span>
                <span className="text-xs text-gray-400 ml-auto">{new Date(review.created_at).toLocaleString("zh-CN")}</span>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-bold text-green-700 mb-1">  哪里最好玩</p>
                  <p className="text-sm text-green-900">{review.q1_enjoy}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-bold text-blue-700 mb-1">  改进建议</p>
                  <p className="text-sm text-blue-900">{review.q2_suggestion}</p>
                </div>
                {review.q3_bug && (
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="text-xs font-bold text-orange-700 mb-1">  发现的问题</p>
                    <p className="text-sm text-orange-900">{review.q3_bug}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
