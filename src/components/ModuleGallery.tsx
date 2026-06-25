"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { injectGameCSS, getRawHtml } from "@/utils/gamePreview";

interface Props {
  userId: string;
}

interface GameItem {
  id: number;
  user_id: string;
  game_title: string;
  html_code?: string;
  game_rules?: string[];
  author_name: string;
  author_grade: number | null;
  author_class_num: number | null;
  created_at: string;
  like_count?: number;
  liked?: boolean;
}

export default function ModuleGallery({ userId }: Props) {
  const [items, setItems] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => { fetchGames(); }, []);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const [galleryRes, likesRes] = await Promise.all([
        fetch("/api/student/gallery", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/student/gallery/likes", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      let games: GameItem[] = [];
      if (galleryRes.ok) games = await galleryRes.json() || [];
      let likesData: Record<string, { count: number; liked: boolean }> = {};
      if (likesRes.ok) likesData = await likesRes.json() || {};
      setItems(games.map((g: any) => ({
        ...g,
        like_count: likesData[g.id]?.count || 0,
        liked: likesData[g.id]?.liked || false,
      })));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const toggleLike = async (e: React.MouseEvent, itemId: number) => {
    e.stopPropagation();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/student/gallery/like", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversation_id: itemId }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => prev.map((item) =>
          item.id === itemId
            ? { ...item, liked: data.liked, like_count: (item.like_count || 0) + (data.liked ? 1 : -1) }
            : item
        ));
      }
    } catch (err) { console.error(err); }
  };

  const openGame = async (item: GameItem) => {
    setSelectedGame(item);
    setGameStarted(false);
    if (item.html_code) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/student/gallery/${item.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSelectedGame((prev) => prev ? { ...prev, html_code: data.html_code } : prev);
      }
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-120px)]">
      <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
    </div>;
  }

  if (selectedGame) {
    return (
      <div className="h-[calc(100vh-120px)] flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => { setSelectedGame(null); setGameStarted(false); }}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition">← 返回</button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-800">{selectedGame.game_title || "未命名游戏"}</h2>
            <p className="text-xs text-gray-500">{selectedGame.author_name} · {selectedGame.author_grade}年级{selectedGame.author_class_num}班</p>
          </div>
          <button onClick={() => {
            const code = getRawHtml(selectedGame.html_code || "");
            const blob = new Blob([code], { type: "text/html" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${selectedGame.game_title || "游戏"}.html`;
            a.click();
          }} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition">  下载</button>
        </div>
        <div className="flex-1 rounded-2xl shadow-lg overflow-hidden relative bg-white">
          {gameStarted ? (
            <iframe
              srcDoc={getRawHtml(selectedGame.html_code || "")}
              className="absolute inset-0 w-full h-full"
              sandbox="allow-scripts allow-same-origin"
              scrolling="no"
              style={{ border: "none" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 cursor-pointer" onClick={() => setGameStarted(true)}>
              <div className="text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                  <span className="text-4xl ml-1">▶️</span>
                </div>
                <p className="text-xl font-bold text-white">点击试玩游戏</p>
              </div>
            </div>
          )}
          {gameStarted && (
            <button onClick={() => setGameStarted(false)} className="absolute top-3 right-3 bg-white/90 hover:bg-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md border border-gray-200 transition">  重新开始</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">  班级游戏作品</h2>
          <p className="text-xs text-gray-500">共 {items.length} 个作品</p>
        </div>
        <button onClick={fetchGames} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">  刷新</button>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <p className="text-6xl mb-4"> </p>
            <p className="text-xl font-bold text-gray-700 mb-2">还没有同学分享游戏</p>
            <p className="text-gray-500">快去创作你的第一个游戏吧！</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-4">
          <div className="grid grid-cols-4 gap-4">
            {items.map((item) => (
              <div key={item.id}
                className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all"
                onClick={() => openGame(item)}>
                <div className="aspect-video bg-gradient-to-br from-indigo-500 to-purple-600 relative flex items-center justify-center">
                  <span className="text-5xl"> </span>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-sm font-bold text-gray-800 truncate">{item.game_title || "未命名游戏"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.author_name} · {item.author_grade}年级{item.author_class_num}班</p>
                  {item.game_rules && item.game_rules.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {item.game_rules.slice(0, 2).map((rule: string, i: number) => (
                        <p key={i} className="text-[10px] text-gray-400 truncate">• {rule}</p>
                      ))}
                      {item.game_rules.length > 2 && <p className="text-[10px] text-gray-400">+{item.game_rules.length - 2} 条规则</p>}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                    <button
                      onClick={(e) => toggleLike(e, item.id)}
                      className={`flex items-center gap-1 text-xs font-medium ${item.liked ? "text-red-500" : "text-gray-400 hover:text-red-400"}`}
                    >
                      <span>{item.liked ? "❤️" : "🤍"}</span>
                      <span>{item.like_count || 0}</span>
                    </button>
                    <span className="text-[10px] text-gray-400">{new Date(item.created_at).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
