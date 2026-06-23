"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { injectGameCSS } from "@/utils/gamePreview";

// html2canvas 动态导入（减少首屏包大小）
let html2canvas: typeof import("html2canvas")["default"] | null = null;
async function getHtml2Canvas() {
  if (!html2canvas) html2canvas = (await import("html2canvas")).default;
  return html2canvas;
}

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
  thumbnail?: string; // base64 截图
}

// 单个游戏卡片（截图预览）
function GameCard({ item, onClick }: { item: GameItem; onClick: () => void }) {
  const [thumbnail, setThumbnail] = useState<string | null>(item.thumbnail || null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  // IntersectionObserver 控制可见时才加载
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 加载游戏代码并截图
  useEffect(() => {
    if (!shouldLoad || thumbnail || loading) return;
    let cancelled = false;

    const loadAndCapture = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || cancelled) return;

        const res = await fetch(`/api/student/gallery/${item.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (!data.html_code || cancelled) return;

        // 创建隐藏 iframe 渲染游戏
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:480px;height:320px;border:none;";
        iframe.sandbox = "allow-scripts";
        document.body.appendChild(iframe);

        iframe.srcdoc = injectGameCSS(data.html_code);

        // 等待加载完成
        await new Promise<void>((resolve) => {
          iframe.onload = () => setTimeout(resolve, 1500); // 等 1.5 秒让游戏渲染
        });

        if (cancelled) {
          document.body.removeChild(iframe);
          return;
        }

        // 截图
        try {
          const h2c = await getHtml2Canvas();
          const canvas = await h2c(iframe.contentDocument!.body, {
            width: 480,
            height: 320,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#000",
          });
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          if (!cancelled) setThumbnail(dataUrl);
        } catch (err) {
          console.error("截图失败:", err);
        }

        document.body.removeChild(iframe);
      } catch (err) {
        console.error("加载游戏失败:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAndCapture();
    return () => { cancelled = true; };
  }, [shouldLoad, item.id]);

  return (
    <div ref={containerRef}
      className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all"
      onClick={onClick}>
      <div className="aspect-video bg-gray-900 relative overflow-hidden">
        {thumbnail ? (
          <img src={thumbnail} alt={item.game_title} className="w-full h-full object-cover" />
        ) : loading ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
            <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
            <span className="text-4xl"> </span>
          </div>
        )}
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
      </div>
    </div>
  );
}

export default function ModuleGallery({ userId }: Props) {
  const [items, setItems] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);

  useEffect(() => { fetchGames(); }, []);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/student/gallery", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setItems(await res.json() || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const openGame = async (item: GameItem) => {
    setSelectedGame(item);
    setGameStarted(false);
    if (item.html_code) return;
    setLoadingGame(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/student/gallery/${item.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSelectedGame((prev) => prev ? { ...prev, html_code: data.html_code } : prev);
      }
    } catch (err) { console.error(err); } finally { setLoadingGame(false); }
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
        <div className="flex-1 rounded-2xl shadow-lg overflow-hidden relative bg-white">
          {loadingGame ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white text-sm">加载游戏中...</p>
              </div>
            </div>
          ) : gameStarted ? (
            <iframe
              srcDoc={injectGameCSS(selectedGame.html_code || "")}
              className="absolute inset-0 w-full h-full"
              sandbox="allow-scripts"
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
              <GameCard key={item.id} item={item} onClick={() => openGame(item)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
