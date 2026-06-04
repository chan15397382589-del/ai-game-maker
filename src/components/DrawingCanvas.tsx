"use client";

import { useState, useCallback } from "react";
import { Tldraw, useEditor } from "tldraw";
import "tldraw/tldraw.css";

interface DrawingCanvasProps {
  onSave?: (imageData: string) => void;
  width?: number;
  height?: number;
}

export default function DrawingCanvas({ onSave, width = 800, height = 600 }: DrawingCanvasProps) {
  const [editor, setEditor] = useState<any>(null);

  const handleSave = useCallback(async () => {
    if (!editor) return;

    // 获取画布内容作为图片
    const shapeIds = editor.getCurrentPageShapeIds();
    if (shapeIds.size === 0) {
      onSave?.("");
      return;
    }

    // 导出为图片
    const { blob } = await editor.toImage([...shapeIds], {
      format: "png",
      background: true,
      padding: 0.2,
    });

    // 转为 base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onSave?.(base64);
    };
    reader.readAsDataURL(blob);
  }, [editor, onSave]);

  const handleClear = useCallback(() => {
    if (!editor) return;
    const shapeIds = editor.getCurrentPageShapeIds();
    editor.deleteShapes([...shapeIds]);
  }, [editor]);

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
      </div>

      {/* tldraw 画布 */}
      <div className="flex-1 border border-gray-200 rounded-b-lg overflow-hidden">
        <Tldraw
          onMount={(editor) => setEditor(editor)}
        />
      </div>
    </div>
  );
}
