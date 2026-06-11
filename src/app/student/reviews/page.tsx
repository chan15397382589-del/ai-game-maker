"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";

interface SharedItem {
  id: number;
  user_id: string;
  game_title: string;
  html_code: string;
  grade: number | null;
  class_num: number | null;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
  author_name: string;
  author_grade: number | null;
  author_class_num: number | null;
  is_mine: boolean;
}

interface Conversation {
  id: string;
  title: string;
  html_code: string | null;
  has_game: boolean;
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

export default function ReviewsPage() {
  const router = useRouter();

  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  // 分享弹窗
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [sharingConvId, setSharingConvId] = useState<string | null>(null);
  const [sharingTitle, setSharingTitle] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      await fetchItems();
      setLoading(false);
    }).catch(() => router.push("/login"));
  }, []);

  const fetchItems = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/reviews", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setItems(await res.json());
    } catch (err) {
      console.error("获取分享列表失败:", err);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleLike = async (item: SharedItem) => {
    const token = await getToken();
    if (!token) return;
    if (item.liked_by_me) {
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, liked_by_me: false, like_count: Math.max(0, i.like_count - 1) } : i)
      );
      await fetch(`/api/reviews/${item.id}/like`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => fetchItems());
    } else {
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, liked_by_me: true, like_count: i.like_count + 1 } : i)
      );
      const res = await fetch(`/api/reviews/${item.id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status === 409) fetchItems();
    }
  };

  // 分享功能
  const handleOpenShare = async () => {
    setShowShareDialog(true);
    setSharingConvId(null);
    setSharingTitle("");
    setLoadingConvs(true);
    const token = await getToken();
    if (!token) { setLoadingConvs(false); return; }
    try {
      const res = await fetch("/api/student/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations((await res.json()) || []);
      }
    } catch {} finally { setLoadingConvs(false); }
  };

  const handleShare = async () => {
    if (!sharingConvId) return;
    const conv = conversations.find((c) => c.id === sharingConvId);
    if (!conv) return;
    const title = sharingTitle.trim() || conv.title;
    if (!title) { alert("请输入游戏名称"); return; }
    setSharing(true);
    const token = await getToken();
    if (!token) { setSharing(false); return; }
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversation_id: sharingConvId, game_title: title, html_code: conv.html_code }),
      });
      if (res.ok) {
        setShowShareDialog(false);
        await fetchItems();
      } else {
        alert((await res.json()).error || "分享失败");
      }
    } catch { alert("分享失败，请重试"); }
    finally { setSharing(false); }
  };

  const handleDelete = async (itemId: number) => {
    if (!confirm("确定要撤回这个分享吗？")) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/reviews/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      }
    } catch { alert("撤回失败"); }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <p className="text-gray-500 text-lg">加载中...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600 text-white flex-shrink-0">
        <button
          onClick={() => router.push("/student")}
          className="text-white hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition text-sm"
        >
          ← 返回
        </button>
        <span className="text-xl">🎨</span>
        <h1 className="text-lg font-bold flex-1">同学作品</h1>
        <button
          onClick={handleOpenShare}
          className="bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 rounded-lg text-sm font-medium transition"
        >
          📤 分享我的作品
        </button>
      </div>

      {/* 作品列表 — 网格布局，一行4个 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center py-20">
                <p className="text-6xl mb-4">🎮</p>
                <p className="text-lg text-gray-500">这里还没有作品</p>
                <p className="text-sm text-gray-400 mt-2">来做第一个分享的人吧！</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition group"
                  onClick={() => router.push(`/student/reviews/${item.id}`)}>
                  {/* 游戏缩略图 */}
                  <div className="aspect-square bg-gray-50 relative overflow-hidden">
                    <iframe
                      srcDoc={item.html_code}
                      title={item.game_title}
                      className="w-full h-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                      loading="lazy"
                      scrolling="no"
                    />
                    {item.is_mine && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className="absolute top-1 right-1 bg-white/80 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg p-1 text-xs transition opacity-0 group-hover:opacity-100 z-10"
                        title="撤回分享">🗑️</button>
                    )}
                  </div>
                  {/* 信息栏：左名字 中游戏名 右点赞评论 */}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm font-bold text-gray-800 truncate flex-shrink-0 max-w-[80px]">{item.author_name}</span>
                    <span className="text-xs text-indigo-600 font-medium truncate mx-2 flex-1 text-center">{item.game_title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleLike(item); }}
                        className={`flex items-center gap-0.5 text-xs transition ${item.liked_by_me ? "text-red-500" : "text-gray-400 hover:text-red-400"}`}
                      >
                        {item.liked_by_me ? "❤️" : "🤍"} {item.like_count || ""}
                      </button>
                      <span className="flex items-center gap-0.5 text-xs text-gray-400">💬 {item.comment_count || ""}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* 分享弹窗 */}
      {showShareDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowShareDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">📤 分享我的作品</h2>
              {loadingConvs ? (
                <p className="text-gray-400 text-sm text-center py-4">加载中...</p>
              ) : conversations.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">
                  你还没有任何对话哦～先去创作一个游戏再来分享吧！
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-3">选择要分享的游戏（只有带 🎮 的才能分享）：</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                    {conversations.map((conv) => {
                      const canShare = !!conv.html_code;
                      return (
                        <label key={conv.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 transition ${
                            !canShare ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                            : sharingConvId === conv.id ? "border-indigo-400 bg-indigo-50 cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 cursor-pointer"}`}>
                          <input type="radio" name="share-conv" value={conv.id}
                            checked={sharingConvId === conv.id}
                            onChange={() => { if (!canShare) return; setSharingConvId(conv.id); setSharingTitle(conv.title !== "新对话" ? conv.title : ""); }}
                            disabled={!canShare} className="accent-indigo-600" />
                          <span className="text-sm text-gray-700">
                            {canShare ? "🎮 " : "📝 "}{conv.title}
                            {!canShare && <span className="text-xs text-gray-400 ml-1">（还没有游戏）</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <input type="text" value={sharingTitle}
                    onChange={(e) => setSharingTitle(e.target.value)}
                    placeholder="给游戏取个展示名称（可选）"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-4 outline-none focus:border-indigo-400" />
                </>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowShareDialog(false)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">取消</button>
                {conversations.length > 0 && (
                  <button onClick={handleShare} disabled={!sharingConvId || sharing}
                    className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                    {sharing ? "分享中..." : "确认分享"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
