"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";

// ============================================================
// 工具函数：获取认证 token
// ============================================================
async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  // getUser 可以触发 session 恢复
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";
  const { data: { session: s2 } } = await supabase.auth.getSession();
  return s2?.access_token || "";
}

// ============================================================
// 核心策略：基于代码块分界（```）的提取方式
// ============================================================

function splitByCodeFences(content: string): { codeParts: string[]; textParts: string[] } {
  const fenceRegex = /(```\w*\n?)/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(match[1]);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  const codeParts: string[] = [];
  const textParts: string[] = [];
  let inCodeBlock = false;

  for (const part of parts) {
    if (/^```/.test(part)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      if (part.trim()) codeParts.push(part);
    } else {
      if (part.trim()) textParts.push(part);
    }
  }

  return { codeParts, textParts };
}

const looksLikeCode = (line: string): boolean => {
  const t = line.trim();
  if (!t || t.length <= 1) return false;

  let score = 0;
  if (/^<\w+/.test(t)) score += 2;
  if (/^\/?\w+\s*\{?$/.test(t) && t.length > 3 && t.length < 80 && /[;{}()\[\]=]/.test(t)) score += 2;
  if (/^\s*[\w.]+\s*\(.*\)\s*[;{]?\s*(\/\/.*)?$/.test(t)) score += 2;
  if (/^\s*\}\s*(else\s+)?(if|while|for|\{|$)/.test(t)) score += 2;
  if (/^\s*\}\s*$/.test(t) || /^\s*\{\s*$/.test(t)) score += 2;
  if (/^\/\/\s*\S+/.test(t) && t.length > 4) score += 2;
  if (/^\/\*/.test(t) || /^\*\//.test(t) || /^\s*\*\s+\w/.test(t)) score += 2;
  if (/^\[[\d,\s\]]+$/.test(t) || /^[[\d,\s]]+,\s*$/.test(t)) score += 2;
  if (/^-?\d+[,\s\]]/.test(t) && t.length > 3) score += 2;
  if (/^\d+[\s,]/.test(t) && t.length > 5) score += 2;
  if (/^(var|let|const|function|return|if|else|for|while|class|import|export|switch|case|default|try|catch|throw)\b/.test(t)) score += 2;
  if (/^(ctx|canvas|document|window|Math|JSON|Array|console|style)\./.test(t)) score += 2;
  if (/this\.\w+/.test(t)) score += 2;
  if (/addEventListener\s*\(/.test(t)) score += 2;
  if (/=>\s*\{/.test(t)) score += 2;
  if (/\$\(/.test(t)) score += 2;
  if (/^[a-zA-Z-]+\s*:\s*[^;]+;?\s*$/.test(t)) score += 1;
  if (/^[a-zA-Z-]+\s*\{/.test(t)) score += 1;
  if (/^\.\w+|#\w+/.test(t)) score += 1;
  if (/=\s*(false|true|\d)/.test(t) && t.includes("=") && t.length < 60) score += 1;
  if (/[;{}]\s*$/.test(t) && t.length > 3 && t.length < 100) score += 1;
  if (/===|!==|<=|>=/.test(t)) score += 1;
  return score >= 2;
};

const extractTextOnly = (content: string): string => {
  const { textParts } = splitByCodeFences(content);
  let result = "";
  for (const segment of textParts) {
    const lines = segment.split("\n");
    const cleanLines = lines.filter((line) => !looksLikeCode(line));
    if (cleanLines.some((l) => l.trim())) {
      result += cleanLines.join("\n") + "\n";
    }
  }
  return result
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/复制到记事本[里中]?/g, "")
    .replace(/保存成.*\.html[文件]?/g, "")
    .replace(/双击就能玩[啦啊]?/g, "")
    .replace(/准备好了吗[?？][!！]?/g, "")
    .replace(/先把代码放出来/g, "")
    .replace(/你复制到/g, "")
    .trim();
};

const extractAllCode = (content: string): string => {
  const { codeParts } = splitByCodeFences(content);
  let code = codeParts.join("\n").trim();
  if (!code) {
    const lines = content.split("\n");
    const codeLines = lines.filter((line) => looksLikeCode(line));
    code = codeLines.join("\n").trim();
  }
  return code;
};

const extractHtmlCode = (content: string): string | null => {
  let match = content.match(/```html\s*([\s\S]*?)```/i);
  if (match && match[1].trim()) return match[1].trim();
  match = content.match(/```\s*([\s\S]*?)```/);
  if (match && match[1].trim() && /<\w/.test(match[1])) return match[1].trim();
  const trimmed = content.trim();
  if (/^<!DOCTYPE|^<html|^<head|^<body|<\w+\s[^>]*>[\s\S]*<\/\w+>/i.test(trimmed)) return trimmed;
  return null;
};

// ============================================================
// 下载 HTML 游戏文件
// ============================================================
function downloadHtml(code: string, title: string) {
  const blob = new Blob([code], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "游戏"}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// 主组件
// ============================================================
export default function StudentPortal() {
  const router = useRouter();
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    {
      role: "assistant",
      content:
        "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？我可以帮你做：\n🎯 迷宫游戏\n🐹 打地鼠\n🍎 接东西游戏\n🏃 跑酷游戏\n🎨 或者其他你喜欢的！\n\n告诉我你的想法吧！",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [htmlCode, setHtmlCode] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [isCoding, setIsCoding] = useState(false);
  const [liveCode, setLiveCode] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);

  // 会话管理相关状态
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [showFiles, setShowFiles] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        // 生成新的会话 ID
        setCurrentSessionId(crypto.randomUUID());
      } else {
        router.push("/login");
      }
      setCheckingAuth(false);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (codeScrollRef.current && isCoding) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [liveCode, isCoding]);

  // 打开文件管理时获取会话列表
  useEffect(() => {
    if (!showFiles || !userId) return;
    fetchSessions();
  }, [showFiles, userId]);

  // 获取会话列表
  const fetchSessions = async () => {
    setLoadingHistory(true);
    const token = await getToken();
    if (!token) { setLoadingHistory(false); return; }
    try {
      const res = await fetch("/api/student/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data || []);
      }
    } catch (err) {
      console.error("获取会话列表失败:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 加载指定会话的消息
  const loadSession = async (sessionId: string, startTime?: string, endTime?: string, gameData?: any) => {
    setLoadingSession(true);
    // 如果 sessionId 不是有效 UUID（历史会话的时间字符串），生成新 UUID
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    const newSessionId = isValidUuid ? sessionId : crypto.randomUUID();
    setCurrentSessionId(newSessionId);
    setGameStarted(false); // 停止当前游戏
    const token = await getToken();
    if (!token) { setLoadingSession(false); return; }

    try {
      let url: string;

      if (startTime && endTime) {
        url = `/api/student/messages?start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`;
      } else {
        url = `/api/student/messages?session_id=${encodeURIComponent(sessionId)}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data || []);
        // 切换游戏：有游戏则加载，无游戏则清空
        if (gameData?.html_code) {
          setHtmlCode(gameData.html_code);
          setGameTitle(gameData.game_title || "");
        } else {
          setHtmlCode("");
          setGameTitle("");
        }
      }
    } catch (err) {
      console.error("加载会话失败:", err);
    } finally {
      setLoadingSession(false);
    }
  };

  // 新建对话
  const startNewConversation = () => {
    setMessages([
      {
        role: "assistant",
        content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？我可以帮你做：\n🎯 迷宫游戏\n🐹 打地鼠\n🍎 接东西游戏\n🏃 跑酷游戏\n🎨 或者其他你喜欢的！\n\n告诉我你的想法吧！",
      },
    ]);
    setCurrentSessionId(crypto.randomUUID());
    setHtmlCode("");
    setGameTitle("");
    setGameStarted(false);
    setShowFiles(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const token = await getToken();

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setIsCoding(false);
    setLiveCode("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          userId,
          sessionId: currentSessionId,
        }),
      });

      if (!response.ok) throw new Error("请求失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let insideCodeBlock = false;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.content || "";
            assistantContent += content;

            if (content.includes("```")) {
              const count = (assistantContent.match(/```/g) || []).length;
              insideCodeBlock = count % 2 === 1;
              setIsCoding(insideCodeBlock);
            }

            if (insideCodeBlock || isCoding) {
              const currentCode = extractAllCode(assistantContent);
              setLiveCode(currentCode);
            }

            const textOnly = extractTextOnly(assistantContent);
            const displayText = textOnly || (insideCodeBlock || isCoding ? "✨ 小智老师正在编写游戏代码，请稍等..." : "");
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: displayText,
              };
              return updated;
            });
          } catch {
            // 忽略解析错误
          }
        }
      }

      const finalText = extractTextOnly(assistantContent);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: finalText || "✅ 游戏代码已生成，请在右侧预览！",
        };
        return updated;
      });

      const code = extractHtmlCode(assistantContent);
      if (code) {
        setHtmlCode(code);
      }
      setIsCoding(false);
      setLiveCode("");
    } catch (error) {
      console.error("发送消息失败:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，我遇到了一点问题，请再试一次！😅" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 上传游戏到教师管理后台
  const handleUpload = async () => {
    if (!htmlCode || !gameTitle.trim() || !userId) return;
    const token = await getToken();
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          game_title: gameTitle,
          html_code: htmlCode,
        }),
      });
      if (res.ok) {
        alert("✅ 游戏已上传到教师管理后台！");
        setGameTitle("");
      } else {
        const err = await res.json();
        alert("❌ 上传失败：" + (err.error || "请重试"));
      }
    } catch {
      alert("上传失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // 下载当前游戏
  const handleDownload = () => {
    if (!htmlCode) return;
    downloadHtml(htmlCode, gameTitle || "我的游戏");
  };

  // 登录检查中显示加载
  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <p className="text-4xl mb-4">🎮</p>
          <p className="text-gray-500 text-lg">正在检查登录状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 左侧：对话区 */}
      <div className="flex flex-col w-1/2 border-r border-gray-200 bg-white">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-indigo-600 text-white">
          <span className="text-2xl">🎮</span>
          <h1 className="text-lg font-bold">AI 游戏创作课堂</h1>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="ml-auto text-sm bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded-lg transition"
          >
            退出登录
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
                {msg.content.split("\n").map((line, j) => (
                  <p key={j} className={j > 0 ? "mt-1" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
          {loading && !isCoding && (
            <div className="flex justify-start">
              <div className="chat-bubble-ai">
                <span className="animate-pulse">小智老师正在思考...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="和 小智老师 聊聊你想做的游戏..."
              className="input-field flex-1"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="btn-primary disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：预览区 */}
      <div className="flex flex-col w-1/2 bg-gray-50 relative">
        {/* 编码动画覆盖层 —— 实时显示代码 */}
        {isCoding && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900 bg-opacity-90 rounded-2xl m-4">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-2xl w-full h-3/4 flex flex-col shadow-2xl border border-indigo-500">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                <span className="ml-3 text-gray-300 text-sm font-mono">小智老师正在编码中...</span>
                <div className="ml-auto">
                  <span className="text-xs text-gray-500 animate-pulse">▌</span>
                </div>
              </div>

              <div
                ref={codeScrollRef}
                className="flex-1 bg-gray-950 rounded-lg p-4 font-mono text-sm overflow-y-auto"
              >
                {liveCode ? (
                  <pre className="text-green-400 whitespace-pre-wrap break-all">
                    {liveCode}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-600">
                    <span className="animate-pulse">准备生成代码...</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>✨ 分析游戏逻辑 → 编写代码 → 调试交互</span>
                <span>{liveCode.length > 0 ? `${liveCode.split("\n").length} 行代码` : ""}</span>
              </div>
            </div>
          </div>
        )}

        {/* 预览区标题 + 上传/下载按钮 */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
          <span className="text-2xl">👀</span>
          <h2 className="text-lg font-bold text-gray-800">游戏预览</h2>
          <div className="ml-auto flex gap-2">
            <input
              type="text"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              placeholder="给游戏起个名字..."
              className="input-field w-40 text-sm"
            />
            <button
              onClick={handleUpload}
              disabled={!htmlCode || !gameTitle.trim() || saving}
              className="btn-primary disabled:opacity-50 text-sm"
              title="上传到教师管理后台"
            >
              {saving ? "上传中..." : "📤 上传游戏"}
            </button>
            <button
              onClick={handleDownload}
              disabled={!htmlCode}
              className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
              title="下载为 HTML 文件"
            >
              ⬇️ 下载游戏
            </button>
          </div>
        </div>

        {/* 文件管理区域（折叠面板） */}
        <div className="border-b border-gray-200">
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition text-sm text-gray-600"
          >
            <span className="font-medium">📂 我的对话</span>
            <span>{showFiles ? "▲ 收起" : "▼ 展开"}</span>
          </button>

          {showFiles && (
            <div className="max-h-56 overflow-y-auto bg-white border-t border-gray-100 p-3 space-y-1.5 text-sm">
              <button
                onClick={startNewConversation}
                className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-sm font-medium transition"
              >
                ➕ 新对话
              </button>

              {loadingHistory ? (
                <p className="text-gray-400 text-center py-3 text-xs">加载中...</p>
              ) : sessions.length === 0 ? (
                <p className="text-gray-400 text-center py-3 text-xs">暂无历史对话</p>
              ) : (
                <div className="space-y-1">
                  {sessions.map((s: any) => (
                    <div
                      key={s.session_id}
                      onClick={() => {
                        if (loadingSession) return;
                        loadSession(s.session_id, s.start_time, s.end_time, s.game);
                        // 在手机上可能需要收起来
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${
                        currentSessionId === s.session_id
                          ? "bg-indigo-100 text-indigo-700"
                          : "hover:bg-gray-100 text-gray-700"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          📝 {s.title}
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.message_count} 条消息
                          {s.has_game ? " 🎮" : ""}
                          {" · "}
                          {new Date(s.last_message_at).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {currentSessionId === s.session_id && (
                        <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                          当前
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* iframe 预览 */}
        <div className="flex-1 p-4">
          {htmlCode ? (
            gameStarted ? (
              <iframe
                srcDoc={htmlCode}
                title="游戏预览"
                className="w-full h-full rounded-2xl bg-white shadow-inner"
                sandbox="allow-scripts"
              />
            ) : (
              <div className="w-full h-full rounded-2xl bg-indigo-50 flex items-center justify-center cursor-pointer"
                onClick={() => setGameStarted(true)}
              >
                <div className="text-center">
                  <div className="text-7xl mb-4 animate-bounce">▶️</div>
                  <p className="text-2xl font-bold text-indigo-600 mb-2">开始游戏</p>
                  <p className="text-sm text-indigo-400">点击开始运行游戏</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-6xl mb-4">🎮</p>
                <p className="text-lg">和 AI 对话，生成你的第一个游戏吧！</p>
                <p className="text-sm mt-2">AI 回复中的游戏代码会自动显示在这里 ✨</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
