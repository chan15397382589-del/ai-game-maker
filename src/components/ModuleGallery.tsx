"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";

interface Props {
  userId: string;
}

interface GameItem {
  id: number;
  user_id: string;
  game_title: string;
  html_code: string;
  author_name: string;
  author_grade: number | null;
  author_class_num: number | null;
  created_at: string;
}

export default function ModuleGallery({ userId }: Props) {
  const [items, setItems] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/reviews", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data || []);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">正在加载班级作品...</p>
        </div>
      </div>
    );
  }

  // 游戏详情视图
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
        </div>
        <div className="flex-1 bg-black rounded-2xl shadow-lg overflow-hidden relative">
          {gameStarted ? (
            <iframe
              srcDoc={selectedGame.html_code}
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

  // 游戏列表
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
                onClick={() => setSelectedGame(item)}>
                <div className="aspect-video bg-gray-100 relative overflow-hidden">
                  <iframe
                    srcDoc={item.html_code}
                    className="w-full h-full border-0 pointer-events-none"
                    sandbox="allow-scripts"
                    loading="lazy"
                    scrolling="no"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                    <span className="text-white text-sm font-bold">点击试玩</span>
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-sm font-bold text-gray-800 truncate">{item.game_title || "未命名游戏"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.author_name} · {item.author_grade}年级{item.author_class_num}班</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
