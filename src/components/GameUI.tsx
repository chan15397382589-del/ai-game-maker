"use client";

import { useState, useEffect, useRef } from "react";

// 打字机效果组件
export function TypewriterText({ text, speed = 30, onComplete }: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const timer = setInterval(() => {
      indexRef.current++;
      setDisplayed(text.substring(0, indexRef.current));
      if (indexRef.current >= text.length) {
        clearInterval(timer);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return <span>{displayed}</span>;
}

// 像素风格对话框
export function PixelDialogue({ speaker, text, onAdvance }: {
  speaker?: string;
  text: string;
  onAdvance?: () => void;
}) {
  const [isComplete, setIsComplete] = useState(false);

  return (
    <div className="bg-gray-900/90 border-2 border-gray-600 rounded-lg p-4 max-w-lg" style={{ clipPath: "polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)" }}>
      {speaker && <p className="text-purple-300 font-bold text-sm mb-2">{speaker}</p>}
      <p className="text-yellow-100 text-sm leading-relaxed">
        <TypewriterText text={text} onComplete={() => setIsComplete(true)} />
      </p>
      {isComplete && (
        <p className="text-white/50 text-xs mt-2 animate-pulse text-right">▼ 点击继续</p>
      )}
    </div>
  );
}

// 状态条组件
export function StatusBar({ label, value, max, color = "#4A90D9" }: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 w-12">{label}</span>
      <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-gray-500 w-12 text-right">{value}/{max}</span>
    </div>
  );
}

// 分数显示
export function ScoreDisplay({ score, label = "分数" }: { score: number; label?: string }) {
  return (
    <div className="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-lg font-bold text-lg shadow-md border-2 border-yellow-500">
      ⭐ {label}: {score}
    </div>
  );
}

// 游戏控制按钮
export function GameControls({ onPause, onRestart, isPaused }: {
  onPause: () => void;
  onRestart: () => void;
  isPaused: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button onClick={onPause} className="bg-white/90 hover:bg-white px-4 py-2 rounded-lg text-sm font-bold text-gray-700 shadow-md border border-gray-200 transition">
        {isPaused ? "▶️ 继续" : "⏸️ 暂停"}
      </button>
      <button onClick={onRestart} className="bg-white/90 hover:bg-white px-4 py-2 rounded-lg text-sm font-bold text-gray-700 shadow-md border border-gray-200 transition">
          重新开始
      </button>
    </div>
  );
}

// 浮动文字效果（得分时弹出）
export function FloatingText({ text, x, y, color = "#FFD700" }: {
  text: string;
  x: number;
  y: number;
  color?: string;
}) {
  return (
    <div
      className="absolute pointer-events-none font-bold text-lg animate-bounce"
      style={{ left: x, top: y, color }}
    >
      {text}
    </div>
  );
}

// 游戏结束弹窗
export function GameOverModal({ score, onRestart, onClose }: {
  score: number;
  onRestart: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 text-center shadow-2xl max-w-sm">
        <p className="text-5xl mb-4"> </p>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">游戏结束</h2>
        <p className="text-lg text-gray-600 mb-6">最终得分: <span className="text-yellow-500 font-bold">{score}</span></p>
        <div className="flex gap-3 justify-center">
          <button onClick={onRestart} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold transition">
            再玩一次
          </button>
          {onClose && (
            <button onClick={onClose} className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition">
              返回
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
