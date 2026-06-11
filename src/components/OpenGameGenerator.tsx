"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  onGameGenerated: (htmlCode: string) => void;
  apiKey?: string;
  apiBaseUrl?: string;
}

interface LogEntry {
  type: "info" | "success" | "error" | "progress" | "assistant";
  content: string;
  time: Date;
}

export default function OpenGameGenerator({ onGameGenerated, apiKey, apiBaseUrl }: Props) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 检查 OpenGame 服务状态
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/opengame/health");
        const data = await res.json();
        setConnected(data.connected);
      } catch {
        setConnected(false);
      }
    };
    checkHealth();
    const timer = setInterval(checkHealth, 10000);
    return () => clearInterval(timer);
  }, []);

  // 自动滚动日志
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((type: LogEntry["type"], content: string) => {
    setLogs((prev) => [...prev, { type, content, time: new Date() }]);
  }, []);

  // 连接 WebSocket 并生成游戏
  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setLogs([]);
    setProgress(0);
    addLog("info", "正在连接 OpenGame 服务...");

    try {
      // WebSocket 连接
      const wsUrl = "ws://localhost:3001";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        addLog("success", "已连接到 OpenGame 服务");
        setConnected(true);

        // 发送生成请求
        ws.send(JSON.stringify({
          type: "generate",
          prompt: prompt.trim(),
          options: {
            apiKey: apiKey || process.env.NEXT_PUBLIC_OPENGAME_API_KEY,
            apiBaseUrl: apiBaseUrl || process.env.NEXT_PUBLIC_OPENGAME_API_BASE_URL,
            authType: "anthropic",
          },
        }));
        addLog("info", `已发送生成请求: "${prompt.trim()}"`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "task_started":
              addLog("info", data.message || "任务已启动");
              break;

            case "task_progress":
              setProgress(data.progress || 0);
              if (data.message) addLog("info", data.message);
              break;

            case "output":
              // CLI 输出（可能是代码流）
              if (data.content) {
                const lines = data.content.split("\n").filter((l: string) => l.trim());
                for (const line of lines.slice(-3)) {
                  addLog("info", line.substring(0, 200));
                }
              }
              break;

            case "assistant_message":
              addLog("assistant", data.content || "");
              break;

            case "tool_call":
              addLog("info", `  调用工具: ${data.tool}`);
              break;

            case "tool_result":
              addLog("info", `  工具结果: ${data.tool}`);
              break;

            case "task_completed":
              addLog("success", "  游戏生成完成！");
              setProgress(100);

              // 尝试获取生成的游戏代码
              if (data.result?.gameDir) {
                fetchGameCode(data.taskId);
              }
              break;

            case "task_error":
              addLog("error", `❌ 错误: ${data.message}`);
              break;

            case "task_cancelled":
              addLog("info", "任务已取消");
              break;

            default:
              addLog("info", JSON.stringify(data).substring(0, 200));
          }
        } catch {
          // 非 JSON 消息
          addLog("info", event.data.toString().substring(0, 200));
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        addLog("error", "连接错误");
        setConnected(false);
      };

      ws.onclose = () => {
        addLog("info", "连接已关闭");
        setGenerating(false);
      };
    } catch (err: any) {
      addLog("error", `连接失败: ${err.message}`);
      setGenerating(false);
    }
  };

  // 获取生成的游戏代码
  const fetchGameCode = async (taskId: string) => {
    try {
      const res = await fetch(`/api/opengame/generate?taskId=${taskId}`);
      const data = await res.json();

      // 尝试从任务目录读取 HTML 文件
      if (data.files) {
        const htmlFile = data.files.find((f: string) => f.endsWith(".html"));
        if (htmlFile) {
          const htmlRes = await fetch(`http://localhost:3001/api/tasks/${taskId}/files/${htmlFile}`);
          if (htmlRes.ok) {
            const htmlCode = await htmlRes.text();
            onGameGenerated(htmlCode);
            addLog("success", "游戏代码已获取");
          }
        }
      }
    } catch (err: any) {
      addLog("error", `获取游戏代码失败: ${err.message}`);
    }
  };

  // 取消生成
  const handleCancel = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "cancel" }));
      wsRef.current.close();
    }
    setGenerating(false);
  };

  // 日志颜色
  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "success": return "text-green-400";
      case "error": return "text-red-400";
      case "progress": return "text-blue-400";
      case "assistant": return "text-purple-400";
      default: return "text-gray-300";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 状态栏 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
        <span className="text-gray-400 text-xs font-mono">
          OpenGame {connected ? "已连接" : "未连接"}
        </span>
        {generating && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-gray-400 text-xs">{progress}%</span>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerate()}
            placeholder="描述你想要的游戏，例如：做一个超级马里奥风格的横版跑酷游戏"
            className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 outline-none focus:border-indigo-500"
            disabled={generating}
          />
          {generating ? (
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition"
            >
              取消
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || !connected}
              className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition"
            >
              生成游戏
            </button>
          )}
        </div>
        {!connected && (
          <p className="text-yellow-400 text-xs mt-2">
            ⚠️ OpenGame 服务未启动。请先运行 <code className="bg-gray-700 px-1 rounded">start-with-opengame.bat</code>
          </p>
        )}
      </div>

      {/* 日志区 */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-3xl mb-2"> </p>
            <p>描述你想要的游戏，AI 帮你生成</p>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1">
              <span className="text-gray-600">
                {log.time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={`ml-2 ${getLogColor(log.type)}`}>{log.content}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
