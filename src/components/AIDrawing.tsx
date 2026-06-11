"use client";

import { useState } from "react";
import { supabase } from "@/components/SupabaseProvider";

interface AIDrawingProps {
  onImageGenerated?: (imageUrl: string) => void;
  gameName?: string;
}

const STYLE_PRESETS = [
  { id: "pixel", label: "像素风", suffix: "，像素风格，复古游戏画面" },
  { id: "cartoon", label: "卡通风", suffix: "，卡通风格，色彩鲜艳，适合儿童" },
  { id: "anime", label: "动漫风", suffix: "，动漫风格，精致画面" },
  { id: "watercolor", label: "水彩风", suffix: "，水彩画风格，柔和色彩" },
  { id: "realistic", label: "写实风", suffix: "，写实风格，高清画面" },
];

export default function AIDrawing({ onImageGenerated, gameName }: AIDrawingProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("cartoon");

  const generateImage = async () => {
    if (!prompt.trim()) {
      setError("请输入描述内容");
      return;
    }

    setGenerating(true);
    setError("");
    setGeneratedImage(null);

    try {
      const style = STYLE_PRESETS.find((s) => s.id === selectedStyle);
      const fullPrompt = `${prompt.trim()}${style?.suffix || ""}，2D游戏画面，适合网页游戏`;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: fullPrompt }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "生成失败");
      }

      const data = await res.json();
      if (data.image) {
        setGeneratedImage(data.image);
        onImageGenerated?.(data.image);
      } else {
        throw new Error("未返回图片");
      }
    } catch (err: any) {
      setError(err.message || "生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const saveToLocal = () => {
    if (!generatedImage) return;
    const a = document.createElement("a");
    a.href = generatedImage;
    a.download = `${gameName || "game"}-design.png`;
    a.click();
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4">
      <h3 className="text-lg font-bold text-gray-800 mb-2">  AI 绘图助手</h3>
      <p className="text-sm text-gray-500 mb-4">输入文字描述，AI 帮你生成游戏画面</p>

      {/* 风格选择 */}
      <div className="flex gap-2 mb-4">
        {STYLE_PRESETS.map((style) => (
          <button
            key={style.id}
            onClick={() => setSelectedStyle(style.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              selectedStyle === style.id
                ? "bg-indigo-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>

      {/* 输入框 */}
      <div className="flex gap-2 mb-4">
        <input
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && !generating && generateImage()}
          placeholder="描述你想要的游戏画面，比如：一个勇敢的小骑士在森林里冒险..."
          className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none"
          disabled={generating}
        />
        <button
          onClick={generateImage}
          disabled={generating || !prompt.trim()}
          className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 text-white rounded-xl text-base font-medium transition"
        >
          {generating ? "生成中..." : "  生成"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* 生成结果 */}
      {generatedImage && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">生成结果</span>
            <button onClick={saveToLocal} className="text-sm text-indigo-500 hover:text-indigo-700 font-medium">  下载图片</button>
          </div>
          <img
            src={generatedImage}
            alt="AI生成的游戏画面"
            className="w-full rounded-xl border border-gray-200"
            style={{ maxHeight: 400, objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  );
}
