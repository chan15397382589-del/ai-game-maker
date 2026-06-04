"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { supabase } from "@/components/SupabaseProvider";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";
import VoiceButton from "@/components/VoiceButton";

function formatAIMessage(text: string): ReactNode[] {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (!line.trim()) return <p key={i}>&nbsp;</p>;
    const isQuestion = /[？?]/.test(line) && !/^[✅❌⚠️▶️\-]/.test(line);
    const isRule = /^[\-·•]\s/.test(line.trim()) || /怎么玩|按.*键|点击.*屏|跳起来|躲开|分数|越来越/.test(line);
    const positiveMatch = line.match(/(好[呀啊的！!]?|不错|真棒|厉害|太好了|很好|对[！!]?\s*[，,]?|你说得[很对]+|清楚|明白了|好规则)/);
    if (isQuestion) return <p key={i} className={`ai-question ${i > 0 ? "mt-1" : ""}`}>{line}</p>;
    if (isRule) return <p key={i} className={`ai-rule ${i > 0 ? "mt-1" : ""}`}>{line}</p>;
    if (positiveMatch) {
      const parts = line.split(positiveMatch[0]);
      return <p key={i} className={i > 0 ? "mt-1" : ""}>{parts[0]}<span className="ai-positive">{positiveMatch[0]}</span>{parts[1]}</p>;
    }
    return <p key={i} className={i > 0 ? "mt-1" : ""}>{line}</p>;
  });
}

interface DesignData {
  game_name?: string;
  game_rules?: string[];
  design_reason?: string;
  design_image?: string;
}

interface Conversation {
  id: string;
  title: string;
  html_code: string | null;
  has_game: boolean;
  message_count: number;
  updated_at: string;
}

interface GameSnapshot {
  id: string;
  html_code: string;
  created_at: string;
}

interface Props { userId: string; }

export default function ModuleCreate({ userId }: Props) {
  const [designData, setDesignData] = useState<DesignData | null>(null);
  const [designLoaded, setDesignLoaded] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [rawMessages, setRawMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [htmlCode, setHtmlCode] = useState("");
  const [liveCode, setLiveCode] = useState("");
  const [isCoding, setIsCoding] = useState(false);
  const [viewMode, setViewMode] = useState<"code" | "game">("code");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameTitle, setGameTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  // 左侧栏状态
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [gameHistory, setGameHistory] = useState<GameSnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 加载设计数据
  useEffect(() => {
    const loadDesign = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token; if (!token) return;
        const res = await fetch("/api/student/tasks?task_id=1-1", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const tasks = await res.json();
          if (tasks.length > 0) {
            const task = tasks[0];
            setDesignData({ game_name: task.game_name, game_rules: task.game_rules || [], design_reason: task.design_reason, design_image: task.design_image });
            if (task.game_name) setGameTitle(task.game_name);
          }
        }
      } catch {} finally { setDesignLoaded(true); }
    };
    loadDesign();
  }, []);

  // 加载对话列表
  const fetchConversations = async () => {
    setLoadingHistory(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const res = await fetch("/api/student/sessions", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setConversations(await res.json() || []);
    } catch {} finally { setLoadingHistory(false); }
  };

  useEffect(() => { fetchConversations(); }, []);

  // 根据设计数据生成初始消息
  useEffect(() => {
    if (!designLoaded) return;
    const rulesText = (designData?.game_rules || []).filter(r => r.trim());
    if (designData?.game_name) {
      const welcome = {
        role: "assistant",
        content: `你好！我是小智老师 🤖✨\n\n我看到你在构思阶段设计了一个游戏！\n\n  游戏名称：${designData.game_name}${designData.design_reason ? `\n  类型：${designData.design_reason}` : ""}${rulesText.length > 0 ? `\n\n  你的规则：\n${rulesText.map((r, i) => `规则${i + 1}：如果${r}`).join("\n")}` : ""}\n\n很好！我现在就根据你的设计来制作这个游戏！点击「  自动生成」让我开始吧。`,
      };
      setMessages([welcome]);
      setRawMessages([welcome]);
    } else {
      const welcome = { role: "assistant", content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？告诉我你的想法吧！" };
      setMessages([welcome]);
      setRawMessages([welcome]);
    }
  }, [designLoaded, designData]);

  const extractHtmlCode = (content: string): string => {
    const htmlFence = /```html\s*\n([\s\S]*?)```/i;
    let match = content.match(htmlFence);
    if (match) return match[1].trim();
    const anyFence = /```\s*\n([\s\S]*?)```/;
    match = content.match(anyFence);
    if (match && match[1].includes("<")) return match[1].trim();
    if (content.includes("<!DOCTYPE") || content.includes("<html")) {
      const start = content.indexOf("<!DOCTYPE") !== -1 ? content.indexOf("<!DOCTYPE") : content.indexOf("<html");
      const end = content.lastIndexOf("</html>");
      if (start !== -1 && end !== -1) return content.substring(start, end + 7);
    }
    return "";
  };

  const extractTextOnly = (content: string): string => {
    return content
      .replace(/```html\s*\n[\s\S]*?```/gi, "")  // 移除html代码块
      .replace(/```\s*\n[\s\S]*?```/g, "")         // 移除其他代码块
      .replace(/```[\s\S]*?```/g, "")               // 移除无换行代码块
      .replace(/`[^`]+`/g, "")                      // 移除行内代码
      .replace(/\*\*([^*]+)\*\*/g, "$1")            // 移除加粗标记
      .replace(/\[.*?\]\(.*?\)/g, "")               // 移除链接
      .trim();
  };

  // 加载对话
  const loadConversation = async (conv: Conversation) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const res = await fetch(`/api/student/messages?session_id=${conv.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const msgs = await res.json();
        // 显示消息：助手消息去掉代码块
        setMessages(msgs.map((m: any) => ({
          role: m.role,
          content: m.role === "assistant" ? extractTextOnly(m.content) : m.content,
        })));
        // 原始消息保留完整内容（用于发送给API）
        setRawMessages(msgs.map((m: any) => ({ role: m.role, content: m.content })));
        setCurrentConvId(conv.id);
        if (conv.html_code) { setHtmlCode(conv.html_code); setLiveCode(conv.html_code); setViewMode("game"); }
      }
    } catch {}
  };

  // 自动发送设计给AI
  const handleAutoGenerate = async () => {
    if (!designData?.game_name || sendingRef.current) return;
    const rulesText = (designData.game_rules || []).filter(r => r.trim()).map(r => `如果${r}`).join("，");
    await handleSendWithContent(`我想做一个${designData.design_reason || "游戏"}，游戏叫"${designData.game_name}"。${rulesText ? `规则是：${rulesText}。` : ""}请帮我做出来！`);
  };

  const handleSendWithContent = async (content: string) => {
    if (!content.trim() || sendingRef.current) return;
    sendingRef.current = true;
    const userMsgObj = { role: "user", content };
    const newRaw = [...rawMessages, userMsgObj];
    setMessages([...messages, userMsgObj]);
    setRawMessages(newRaw);
    setLoading(true);
    setInput("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      if (!currentConvId) {
        const convRes = await fetch("/api/student/sessions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: designData?.game_name || "新对话" }) });
        if (convRes.ok) { const conv = await convRes.json(); setCurrentConvId(conv.id); }
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newRaw.map((m) => ({ role: m.role, content: m.content })), currentCode: htmlCode || undefined, sessionId: currentConvId }),
      });
      if (!res.ok) { setLoading(false); sendingRef.current = false; return; }
      await processStream(res);
    } catch {} finally { setLoading(false); sendingRef.current = false; }
  };

  const handleSend = async () => { if (input.trim()) await handleSendWithContent(input.trim()); };

  const processStream = async (res: Response) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";
    let fenceCount = 0;
    let lastDisplayLen = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            assistantContent += parsed.content;
            const fenceMatches = parsed.content.match(/```/g);
            if (fenceMatches) fenceCount += fenceMatches.length;
            const inCodeBlock = fenceCount % 2 !== 0;
            if (inCodeBlock) { setIsCoding(true); setViewMode("code"); const code = extractHtmlCode(assistantContent); if (code) setLiveCode(code); }
            // 只在非代码块时更新显示
            if (!inCodeBlock) {
              const textOnly = extractTextOnly(assistantContent);
              if (textOnly && textOnly.length - lastDisplayLen > 50) {
                lastDisplayLen = textOnly.length;
                setMessages((prev) => { const msgs = [...prev]; const lastIdx = msgs.length - 1; if (lastIdx >= 0 && msgs[lastIdx].role === "assistant" && (msgs[lastIdx] as any)._s) { msgs[lastIdx] = { role: "assistant", content: textOnly, _s: true } as any; } else { msgs.push({ role: "assistant", content: textOnly, _s: true } as any); } return msgs; });
              }
            }
          }
        } catch {}
      }
    }

    setIsCoding(false);
    const finalCode = extractHtmlCode(assistantContent);
    const finalText = extractTextOnly(assistantContent);
    // 只显示有文字内容的消息，如果只有代码则显示提示
    const displayText = finalText || "游戏代码已生成，请查看右侧预览区！";
    setMessages((prev) => { const msgs = [...prev]; const lastIdx = msgs.length - 1; if (lastIdx >= 0 && msgs[lastIdx].role === "assistant" && (msgs[lastIdx] as any)._s) { msgs[lastIdx] = { role: "assistant", content: displayText }; } else { msgs.push({ role: "assistant", content: displayText }); } return msgs; });
    setRawMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    if (finalCode) { setHtmlCode(finalCode); setLiveCode(finalCode); setViewMode("game"); setGameStarted(false); }
  };

  const handleUpload = async () => {
    if (!htmlCode || !gameTitle.trim()) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ game_title: gameTitle.trim(), html_code: htmlCode }) });
      if (res.ok) alert("上传成功！");
    } catch {} finally { setSaving(false); }
  };

  const handleDownload = () => {
    if (!htmlCode) return;
    const blob = new Blob([htmlCode], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${gameTitle || "游戏"}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const deleteConversation = async (convId: string) => {
    if (!confirm("确定删除这个对话？")) return;
    setDeletingId(convId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      await fetch("/api/student/sessions", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: convId }) });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (convId === currentConvId) { setCurrentConvId(null); setMessages([]); setRawMessages([]); setHtmlCode(""); }
    } catch {} finally { setDeletingId(null); }
  };

  const handleRename = async (convId: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      await fetch("/api/student/sessions", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: convId, title: renameValue.trim() }) });
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: renameValue.trim() } : c));
    } catch {} finally { setRenamingId(null); }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex h-[calc(100vh-120px)] gap-3">
      {/* 左侧导航栏 */}
      <div className="w-44 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col flex-shrink-0 overflow-hidden">
        {/* 任务入口 */}
        <div className="px-3 py-2 border-b border-gray-100">
          <button onClick={() => window.location.href = "/student"} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition">
            <span> </span><span>任务中心</span>
          </button>
        </div>
        <div className="px-3 py-2 text-xs font-medium text-gray-500">  我的对话</div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loadingHistory ? <p className="text-gray-400 text-center py-2 text-xs">加载中...</p> : conversations.length === 0 ? <p className="text-gray-400 text-center py-2 text-xs">暂无对话</p> : (
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <div key={conv.id} className={`flex items-center rounded-lg transition group ${currentConvId === conv.id ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-100 text-gray-600"}`}>
                  <div onClick={() => loadConversation(conv)} className="flex-1 min-w-0 px-2 py-1.5 cursor-pointer">
                    {renamingId === conv.id ? (
                      <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => handleRename(conv.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(conv.id); if (e.key === "Escape") setRenamingId(null); }} onClick={(e) => e.stopPropagation()} className="w-full text-xs px-1 py-0.5 border border-indigo-300 rounded outline-none" />
                    ) : (
                      <>
                        <p className="text-xs font-medium truncate">{conv.has_game ? "🎮 " : "📝 "}{conv.title}</p>
                        <p className="text-[10px] text-gray-400">{conv.message_count} 条</p>
                      </>
                    )}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setRenamingId(conv.id); setRenameValue(conv.title); }} className="text-gray-300 hover:text-indigo-500 p-1 transition opacity-0 group-hover:opacity-100" title="重命名">✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} disabled={deletingId === conv.id} className="text-gray-300 hover:text-red-500 p-1 transition opacity-0 group-hover:opacity-100" title="删除">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 mx-2" />
        <div className="px-3 py-2 text-xs font-medium text-gray-500">🎮 历史游戏</div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {gameHistory.length === 0 ? <p className="text-[10px] text-gray-400 text-center py-2">还没有生成游戏</p> : gameHistory.map((snap) => (
            <div key={snap.id} onClick={() => { setHtmlCode(snap.html_code); setGameStarted(false); setViewMode("game"); }} className="px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 text-gray-600 transition">
              <p className="text-xs font-medium truncate">🎮 游戏</p>
            </div>
          ))}
        </div>
      </div>

      {/* 中间：对话 */}
      <div className="flex-[1.2] flex flex-col bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-indigo-600 text-white">
          <h1 className="text-lg font-bold">  游戏设计</h1>
          {designData?.game_name && <span className="text-sm bg-white/20 px-2 py-0.5 rounded">正在做：{designData.game_name}</span>}
          <button onClick={handleAutoGenerate} disabled={loading || !designData?.game_name} className="ml-auto text-sm bg-white text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition disabled:opacity-50">  自动生成</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 设计图展示 */}
          {designData?.design_image && (
            <div className="flex justify-start">
              <div className="max-w-[60%] bg-indigo-50 rounded-2xl rounded-bl-md p-3 border border-indigo-200">
                <p className="text-xs font-bold text-indigo-700 mb-2">  你的设计图</p>
                <img src={designData.design_image} alt="设计图" className="w-full rounded-lg border border-indigo-200" />
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={`${i}-${msg.content.length}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-14 h-14 flex-shrink-0 mr-3 mt-1">
                  <XiaozhiAvatar state={i === messages.length - 1 && loading ? "thinking" : i === messages.length - 1 && htmlCode ? "success" : "idle"} />
                </div>
              )}
              <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai max-w-[75%]"}>
                {msg.role === "assistant" ? formatAIMessage(extractTextOnly(msg.content)) : msg.content.split("\n").map((line, j) => <p key={j} className={j > 0 ? "mt-1" : ""}>{line}</p>)}
              </div>
            </div>
          ))}
          {loading && !isCoding && (
            <div className="flex justify-start">
              <div className="w-14 h-14 flex-shrink-0 mr-3 mt-1"><XiaozhiAvatar state="thinking" /></div>
              <div className="chat-bubble-ai"><span className="animate-pulse">小智老师正在思考...</span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex gap-2">
            <VoiceButton onResult={(text) => setInput(text)} />
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="和小智老师聊聊你想做的游戏..." className="input-field flex-1" disabled={loading} />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="btn-primary disabled:opacity-50">发送</button>
          </div>
        </div>
      </div>

      {/* 右侧：预览 */}
      <div className="flex-[1.8] flex flex-col bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-nowrap overflow-hidden">
          <h2 className="text-base font-bold text-gray-800 whitespace-nowrap">预览</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            <button onClick={() => setViewMode("code")} className={`px-2 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${viewMode === "code" ? "bg-white shadow" : "text-gray-500"}`}>代码</button>
            <button onClick={() => setViewMode("game")} className={`px-2 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${viewMode === "game" ? "bg-white shadow" : "text-gray-500"}`}>游戏</button>
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">{htmlCode ? `${htmlCode.split("\n").length}行` : ""}</span>
          <div className="flex-1" />
          <input value={gameTitle} onChange={(e) => setGameTitle(e.target.value)} placeholder="名称" className="w-16 text-xs px-1.5 py-1 border border-gray-200 rounded flex-shrink-0 outline-none" />
          <button onClick={handleUpload} disabled={!htmlCode || !gameTitle.trim() || saving} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50 flex-shrink-0">{saving ? "..." : "上传"}</button>
          <button onClick={handleDownload} disabled={!htmlCode} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50 flex-shrink-0">下载</button>
        </div>
        <div className="flex-1 overflow-auto">
          {viewMode === "code" ? (
            <div className="h-full p-4">
              {isCoding || liveCode || htmlCode ? (
                <div className="h-full bg-gray-900 rounded-2xl overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <div className={`w-2.5 h-2.5 rounded-full ${isCoding ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
                    <span className="text-gray-400 text-xs font-mono">{isCoding ? "正在编写..." : "game.html"}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                    {(liveCode || htmlCode).split("\n").map((line, i) => <div key={i} className="flex"><span className="text-gray-600 w-8 text-right mr-3">{i + 1}</span><span className="text-gray-300">{line}</span></div>)}
                  </div>
                </div>
              ) : <div className="h-full flex items-center justify-center text-gray-400"><p>和AI对话生成游戏代码</p></div>}
            </div>
          ) : (
            <div className="h-full p-4 flex items-center justify-center">
              {htmlCode ? (gameStarted ? <iframe srcDoc={htmlCode} className="w-full h-full rounded-2xl" sandbox="allow-scripts" scrolling="no" /> : <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center cursor-pointer" onClick={() => setGameStarted(true)}><div className="text-center"><div className="text-7xl mb-4 animate-bounce">▶️</div><p className="text-2xl font-bold text-indigo-600">先来玩一玩游戏吧！</p><p className="text-sm text-indigo-400">点击开始试玩</p></div></div>) : <div className="text-center text-gray-400"><p className="text-6xl mb-4"> </p><p>生成游戏后在这里预览</p></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
