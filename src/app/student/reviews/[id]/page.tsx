"use client";

import { useState, useEffect, use } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";
import { validateComment } from "@/lib/profanity";

const GRADES = [
  { value: 3, label: "三年级" },
  { value: 4, label: "四年级" },
  { value: 5, label: "五年级" },
  { value: 6, label: "六年级" },
];

interface SharedItem {
  id: number;
  user_id: string;
  game_title: string;
  html_code: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
  author_name: string;
  author_grade: number | null;
  author_class_num: number | null;
  is_mine: boolean;
}

interface Comment {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
}

async function getToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    await supabase.auth.refreshSession();
    const { data: { session: s2 } } = await supabase.auth.getSession();
    return s2?.access_token || "";
  } catch {
    return "";
  }
}

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [item, setItem] = useState<SharedItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      await Promise.all([fetchItem(), fetchComments()]);
      setLoading(false);
    }).catch(() => router.push("/login"));
  }, []);

  const fetchItem = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/reviews", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const items: SharedItem[] = await res.json();
        const found = items.find((i) => i.id === parseInt(id));
        if (found) setItem(found);
      }
    } catch (err) {
      console.error("获取作品失败:", err);
    }
  };

  const fetchComments = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/reviews/${id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setComments(await res.json());
    } catch (err) {
      console.error("获取评论失败:", err);
    }
  };

  const handleLike = async () => {
    if (!item) return;
    const token = await getToken();
    if (!token) return;
    if (item.liked_by_me) {
      setItem({ ...item, liked_by_me: false, like_count: Math.max(0, item.like_count - 1) });
      await fetch(`/api/reviews/${item.id}/like`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => fetchItem());
    } else {
      setItem({ ...item, liked_by_me: true, like_count: item.like_count + 1 });
      const res = await fetch(`/api/reviews/${item.id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status === 409) fetchItem();
    }
  };

  const handleComment = async () => {
    const validation = validateComment(commentText);
    if (!validation.valid) { setCommentError(validation.error!); return; }
    setSubmittingComment(true);
    setCommentError("");
    const token = await getToken();
    if (!token) { setSubmittingComment(false); return; }
    try {
      const res = await fetch(`/api/reviews/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setCommentText("");
        if (item) setItem({ ...item, comment_count: item.comment_count + 1 });
      } else {
        const err = await res.json();
        setCommentError(err.error || "评论失败");
      }
    } catch {
      setCommentError("网络错误，请重试");
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <p className="text-gray-500 text-lg">加载中...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-gray-500 text-lg">作品不存在或已被撤回</p>
          <button onClick={() => router.push("/student/reviews")}
            className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm">← 返回同学作品</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600 text-white flex-shrink-0">
        <button
          onClick={() => router.push("/student/reviews")}
          className="text-white hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition text-sm"
        >
          ← 返回
        </button>
        <span className="text-xl">🎮</span>
        <h1 className="text-lg font-bold flex-1 truncate">{item.game_title}</h1>
        <span className="text-sm text-indigo-200">
          {item.author_name}
          {item.author_grade && ` · ${GRADES.find(g => g.value === item.author_grade)?.label || ""}`}
          {item.author_class_num && `${item.author_class_num}班`}
        </span>
      </div>

      {/* 主体：左右结构 */}
      <div className="flex-1 min-h-0 flex">
        {/* 左侧：游戏预览 */}
        <div className="flex-1 min-w-0 border-r border-gray-200">
          {gameStarted ? (
            <iframe srcDoc={item.html_code} title={item.game_title}
              className="w-full h-full" sandbox="allow-scripts" />
          ) : (
            <div className="w-full h-full bg-white flex items-center justify-center cursor-pointer hover:bg-gray-50 transition"
              onClick={() => setGameStarted(true)}>
              <div className="text-center">
                <p className="text-7xl mb-4 animate-bounce">▶️</p>
                <p className="text-2xl font-bold text-indigo-600">点击运行游戏</p>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：点赞 + 评论 */}
        <div className="flex-1 flex-shrink-0 flex flex-col bg-white">
          {/* 点赞区 */}
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={handleLike}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl text-xl font-bold transition ${
                item.liked_by_me
                  ? "bg-red-50 text-red-500 border-2 border-red-200"
                  : "bg-gray-50 text-gray-400 hover:text-red-400 border-2 border-gray-200 hover:border-red-200"
              }`}
            >
              {item.liked_by_me ? "❤️" : "🤍"} {item.like_count > 0 ? item.like_count : "点赞"}
            </button>
          </div>

          {/* 评论列表 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            <p className="text-sm font-medium text-gray-600 mb-1">💬 评论 ({comments.length})</p>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">还没有评论，来写第一条吧～</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-indigo-600">{c.author_name}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{c.content}</p>
                </div>
              ))
            )}
          </div>

          {/* 评论输入 */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input type="text" value={commentText}
                onChange={(e) => { setCommentText(e.target.value); setCommentError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleComment()}
                placeholder="写一句关于这个游戏的想法..."
                className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none"
                disabled={submittingComment} />
              <button onClick={handleComment}
                disabled={submittingComment || !commentText.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-3 rounded-xl text-sm font-medium transition">
                {submittingComment ? "..." : "发送"}
              </button>
            </div>
            {commentError && <p className="text-xs text-red-500 mt-1">{commentError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
