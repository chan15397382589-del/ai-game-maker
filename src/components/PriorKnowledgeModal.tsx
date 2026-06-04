"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  onComplete: (answers: { q1_gaming: string; q2_programming: string; q3_favorite: string; skipped: boolean } | null) => void;
}

export default function PriorKnowledgeModal({ onComplete }: Props) {
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const allFilled = q1.trim() && q2.trim() && q3.trim();

  const handleSubmit = () => {
    onComplete({
      q1_gaming: q1.trim(),
      q2_programming: q2.trim(),
      q3_favorite: q3.trim(),
      skipped: false,
    });
  };

  const modal = (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto relative">
        <div className="text-4xl mb-3 text-center"> </div>
        <h2 className="text-xl font-bold text-gray-800 mb-1 text-center">先了解一下你～</h2>

        {/* 跳过按钮 */}
        <div className="text-center mb-6 flex items-center justify-center gap-1.5">
          <span className="text-gray-400 text-sm select-none">请认真作答哦～</span>
          <span
            onClick={() => onComplete(null)}
            className="inline-block w-2.5 h-2.5 rounded-full bg-red-400 cursor-pointer hover:bg-red-500 hover:scale-125 transition-all"
            role="button"
            tabIndex={0}
            title="跳过前测"
            onKeyDown={(e) => e.key === "Enter" && onComplete(null)}
          />
        </div>

        {/* Q1 */}
        <div className="mb-5">
          <p className="text-gray-700 font-medium mb-2 text-base">
            <span className="text-indigo-600 font-bold">1.</span> 你平时有玩游戏吗？什么样的游戏？
          </p>
          <textarea
            value={q1}
            onChange={(e) => setQ1(e.target.value)}
            placeholder="比如：我经常玩和平精英、蛋仔派对..."
            rows={2}
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
          />
        </div>

        {/* Q2 */}
        <div className="mb-5">
          <p className="text-gray-700 font-medium mb-2 text-base">
            <span className="text-indigo-600 font-bold">2.</span> 你有学过编程，写过代码吗？
          </p>
          <textarea
            value={q2}
            onChange={(e) => setQ2(e.target.value)}
            placeholder="比如：没有学过 / 用过Scratch积木..."
            rows={2}
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
          />
        </div>

        {/* Q3 */}
        <div className="mb-6">
          <p className="text-gray-700 font-medium mb-2 text-base">
            <span className="text-indigo-600 font-bold">3.</span> 你喜欢玩游戏吗？如果喜欢，喜欢什么类型的游戏？
          </p>
          <textarea
            value={q3}
            onChange={(e) => setQ3(e.target.value)}
            placeholder="比如：喜欢！我喜欢跑酷和射击游戏..."
            rows={2}
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!allFilled}
          className={`w-full py-3 px-6 rounded-xl text-lg font-semibold transition-all ${
            allFilled
              ? "bg-green-500 hover:bg-green-600 text-white shadow-md"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          提交 ✅
        </button>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
