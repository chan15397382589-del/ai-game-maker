"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface DrawingToolProps {
  onSave?: (data: { png: string; duration: number; saveCount: number; undoCount: number }) => void;
  width?: number;
  height?: number;
  initialImage?: string;
}

const COLORS = ["#000000", "#FF0000", "#00AA00", "#0000FF", "#FF9900", "#9900FF", "#00CCCC", "#FF6699"];
const BRUSH_SIZES = [2, 5, 10];

export default function DrawingTool({ onSave, width = 400, height = 300, initialImage }: DrawingToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(5);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [saveCount, setSaveCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const startTimeRef = useRef(Date.now());
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    if (initialImage) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        saveToHistory();
      };
      img.src = initialImage;
    } else {
      saveToHistory();
    }
  }, []);

  // 保存历史状态
  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(imageData);
      return newHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex, width, height]);

  // 获取鼠标/触摸位置
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;

    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // 开始绘画
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);

    setIsDrawing(true);
    lastPointRef.current = pos;

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = brushSize * 3;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
    }
  };

  // 绘画中
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
  };

  // 结束绘画
  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
  };

  // 撤销
  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
    setUndoCount((prev) => prev + 1);
  };

  // 重做
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newIndex = historyIndex + 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  };

  // 清空
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    saveToHistory();
  };

  // 保存
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const png = canvas.toDataURL("image/png");
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const newSaveCount = saveCount + 1;
    setSaveCount(newSaveCount);

    onSave?.({ png, duration, saveCount: newSaveCount, undoCount });
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {/* 画笔/橡皮擦 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTool("pen")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tool === "pen" ? "bg-white text-gray-800 shadow" : "text-gray-500"
            }`}
          >✏️ 画笔</button>
          <button
            onClick={() => setTool("eraser")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tool === "eraser" ? "bg-white text-gray-800 shadow" : "text-gray-500"
            }`
          }>{tool === "eraser" ? "  " : "  "} 橡皮擦</button>
        </div>

        {/* 画笔粗细 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setBrushSize(size)}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition ${
                brushSize === size ? "bg-white shadow" : "hover:bg-gray-200"
              }`}
            >
              <div
                className="rounded-full bg-gray-700"
                style={{ width: size + 2, height: size + 2 }}
              />
            </button>
          ))}
        </div>

        {/* 颜色选择 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setTool("pen"); }}
              className={`w-6 h-6 rounded-full border-2 transition ${
                color === c && tool === "pen" ? "border-gray-800 scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* 撤销/重做/清空 */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition text-sm"
            title="撤销"
          >↩️</button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition text-sm"
            title="重做"
          >↪️</button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg bg-gray-100 hover:bg-red-100 text-red-500 transition text-sm"
            title="清空"
          > ️</button>
        </div>

        {/* 保存 */}
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition"
        >  保存设计图</button>
      </div>

      {/* 画布 */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border-2 border-gray-200 rounded-xl shadow-sm cursor-crosshair bg-white"
        style={{ maxWidth: "100%", touchAction: "none" }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {/* 状态栏 */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>画笔：{tool === "pen" ? color : "橡皮擦"}</span>
        <span>粗细：{brushSize}px</span>
        <span>保存：{saveCount}次</span>
        <span>撤销：{undoCount}次</span>
      </div>
    </div>
  );
}
