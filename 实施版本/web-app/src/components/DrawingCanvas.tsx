"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";

// 动态导入 Excalidraw（避免 SSR 问题）
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false }
);

interface DrawingCanvasProps {
  onSave?: (imageData: string) => void;
  width?: number;
  height?: number;
}

export default function DrawingCanvas({ onSave, width = 800, height = 600 }: DrawingCanvasProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  const handleSave = useCallback(async () => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    if (!elements || elements.length === 0) {
      onSave?.("");
      return;
    }

    // 导出为图片
    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const blob = await exportToBlob({
      elements,
      appState: { exportWithDarkMode: false },
      files: excalidrawAPI.getFiles(),
      mimeType: "image/png",
    });

    // 转为 base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onSave?.(base64);
    };
    reader.readAsDataURL(blob);
  }, [excalidrawAPI, onSave]);

  const handleClear = useCallback(() => {
    if (!excalidrawAPI) return;
    excalidrawAPI.updateScene({ elements: [] });
  }, [excalidrawAPI]);

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-t-lg">
        <button
          onClick={handleSave}
          className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition"
        >
           保存设计图
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition"
        >
            清空
        </button>
        <span className="text-xs text-gray-500 ml-2">使用左侧工具栏画图</span>
      </div>

      {/* Excalidraw 画布 */}
      <div className="flex-1 border border-gray-200 rounded-b-lg overflow-hidden">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={{
            appState: {
              viewBackgroundColor: "#ffffff",
            },
          }}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
            },
          }}
        />
      </div>
    </div>
  );
}
