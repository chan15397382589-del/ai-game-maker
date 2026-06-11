"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/components/SupabaseProvider";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";
import VoiceButton from "@/components/VoiceButton";
import { getValidationMessage } from "@/utils/inputValidation";

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
  ai_prompt?: string;
  image_history?: { url: string; prompt: string }[];
}

interface Props { userId: string; }

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
  const router = useRouter();
  const [designData, setDesignData] = useState<DesignData | null>(null);
  const [designLoaded, setDesignLoaded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
            let aiPrompt = "";
            let imageHistory: { url: string; prompt: string }[] = [];
            try {
              const info = JSON.parse(task.design_reason || "{}");
              aiPrompt = info.ai_prompt || "";
              imageHistory = info.image_history || [];
            } catch {}
            setDesignData({
              game_name: task.game_name,
              game_rules: task.game_rules || [],
              design_reason: task.design_reason,
              design_image: task.design_image,
              ai_prompt: aiPrompt,
              image_history: imageHistory,
            });
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
    } catch (err) { console.error("加载对话列表失败:", err); } finally { setLoadingHistory(false); }
  };

  useEffect(() => { fetchConversations(); }, []);

  // 根据设计数据生成初始消息
  useEffect(() => {
    if (!designLoaded) return;
    const rulesText = (designData?.game_rules || []).filter(r => r.trim());
    if (designData?.game_name) {
      // 构建包含设计信息的欢迎消息
      let welcomeContent = `你好！我是小智老师 🤖✨\n\n我看到你在构思阶段设计了一个游戏！\n\n`;
      welcomeContent += `  游戏名称：${designData.game_name}\n`;
      if (rulesText.length > 0) {
        welcomeContent += `\n  你的规则：\n`;
        rulesText.forEach((r, i) => { welcomeContent += `规则${i + 1}：如果${r}\n`; });
      }
      if (designData.ai_prompt) {
        welcomeContent += `\n  你描述的画面：${designData.ai_prompt}\n`;
      }
      welcomeContent += `\n很好！我现在就根据你的设计来制作这个游戏！点击「  自动生成」让我开始吧。`;

      const welcome = { role: "assistant", content: welcomeContent };
      setMessages([welcome]);
      setRawMessages([welcome]);
    } else {
      const welcome = { role: "assistant", content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？告诉我你的想法吧！" };
      setMessages([welcome]);
      setRawMessages([welcome]);
    }
  }, [designLoaded, designData]);

  const extractHtmlCode = (content: string): string => {
    // 1. 匹配 ```html ... ```
    const htmlFence = /```html\s*\n([\s\S]*?)```/i;
    let match = content.match(htmlFence);
    if (match) return match[1].trim();

    // 2. 匹配 ``` ... ``` (包含HTML标签)
    const anyFence = /```\s*\n([\s\S]*?)```/;
    match = content.match(anyFence);
    if (match && match[1].includes("<")) return match[1].trim();

    // 3. 匹配没有闭合的 ```html (流式传输中可能未闭合)
    const unclosedHtml = /```html\s*\n([\s\S]*)/i;
    match = content.match(unclosedHtml);
    if (match && match[1].length > 100) return match[1].trim();

    // 4. 相DOCTYPE或<html
    if (content.includes("<!DOCTYPE") || content.includes("<html")) {
      const start = content.indexOf("<!DOCTYPE") !== -1 ? content.indexOf("<!DOCTYPE") : content.indexOf("<html");
      const end = content.lastIndexOf("</html>");
      if (start !== -1 && end !== -1) return content.substring(start, end + 7);
      // 如果没有</html>，取到末尾
      if (start !== -1) return content.substring(start);
    }

    // 5. 匹配包含<canvas或<script的代码块
    if (content.includes("<canvas") || content.includes("<script")) {
      const start = Math.max(
        content.indexOf("<canvas"),
        content.indexOf("<script"),
        content.indexOf("<div")
      );
      if (start > 0) {
        const end = content.lastIndexOf("</html>");
        if (end !== -1) return content.substring(start, end + 7);
        return content.substring(start);
      }
    }

    return "";
  };

  const extractTextOnly = (content: string): string => {
    return content
      .replace(/```html\s*\n[\s\S]*?```/gi, "")  // 移除完整html代码块
      .replace(/```html[\s\S]*?```/gi, "")        // 移除无换行html代码块
      .replace(/```\s*\n[\s\S]*?```/g, "")         // 移除其他代码块
      .replace(/```[\s\S]*?```/g, "")               // 移除无换行代码块
      .replace(/```[\s\S]*/g, "")                   // 移除未闭合的代码块（流式传输中）
      .replace(/`[^`]+`/g, "")                      // 移除行内代码
      .replace(/\*\*([^*]+)\*\*/g, "$1")            // 移除加粗标记
      .replace(/\[.*?\]\(.*?\)/g, "")               // 移除链接
      .replace(/<[^>]+>/g, "")                      // 移除HTML标签
      .replace(/\n{3,}/g, "\n\n")                   // 压缩多余空行
      .replace(/^\s*[\r\n]/gm, "")                  // 移除空行
      .trim();
  };

  // 检查消息是否包含代码
  const hasCode = (content: string): boolean => {
    return /```/.test(content) || /<html|<!DOCTYPE|<canvas|<script/i.test(content);
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
        setGameStarted(false);
        if (conv.html_code) { setHtmlCode(conv.html_code); setLiveCode(conv.html_code); setViewMode("game"); }
        else { setHtmlCode(""); setLiveCode(""); setViewMode("code"); }
      }
    } catch (err) {
      console.error("加载对话失败:", err);
    }
  };

  // 自动生成游戏（MIMO 蓝图生成）
  const handleAutoGenerate = async () => {
    if (!designData?.game_name || sendingRef.current) return;

    const imageUrl = selectedImage || designData?.design_image;
    if (!imageUrl) { alert("请先在构思阶段用AI生成图片"); return; }

    sendingRef.current = true;
    setLoading(true);
    setViewMode("code");
    setLiveCode("//   正在分析设计图...\n// 生成视觉蓝图中...\n\n请稍候...");
    setIsCoding(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/ai/blueprint-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl, gameName: designData.game_name, rules: designData.game_rules }),
      });
      const data = await res.json();

      if (res.ok && data.code) {
        setIsCoding(false); setHtmlCode(data.code); setLiveCode(data.code); setViewMode("game");
        setMessages((prev) => [...prev, { role: "user", content: `请帮我制作游戏"${designData.game_name}"` }]);
        setMessages((prev) => [...prev, { role: "assistant", content: `  游戏已生成完成！\n\n请在右侧预览区查看。` }]);
        setRawMessages((prev) => [...prev, { role: "assistant", content: data.code }]);
      } else {
        setIsCoding(false); setLiveCode(`// 生成失败：${data.error || "请重试"}`);
        setMessages((prev) => [...prev, { role: "user", content: `请帮我制作游戏"${designData.game_name}"` }]);
        setMessages((prev) => [...prev, { role: "assistant", content: `  生成失败：${data.error || "请重试"}` }]);
      }
    } catch (e: any) {
      setIsCoding(false); setLiveCode(`// 生成失败：${e.message}`);
    } finally {
      setLoading(false); sendingRef.current = false;
    }
  };

  // 图片生代码（使用MIMO图片理解）
  const handleImageToCode = async () => {
    const imageUrl = selectedImage || designData?.design_image;
    if (!imageUrl || sendingRef.current) return;

    sendingRef.current = true;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: "  请根据设计图生成游戏代码" }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/ai/image-to-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl }),
      });

      const data = await res.json();
      if (res.ok && data.code) {
        setHtmlCode(data.code);
        setLiveCode(data.code);
        setViewMode("code");
        const promptMsg = data.prompt ? `\n\n  图片分析：${data.prompt}` : "";
        setMessages((prev) => [...prev, { role: "assistant", content: `  已根据设计图生成游戏代码！${promptMsg}\n\n请查看右侧预览区。` }]);
        setRawMessages((prev) => [...prev, { role: "assistant", content: data.code }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `生成失败：${data.error || "请重试"}` }]);
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `生成失败：${e.message}` }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const handleSendWithContent = async (content: string) => {
    if (!content.trim() || sendingRef.current) return;

    // 输入验证
    const recentUserMessages = messages.filter(m => m.role === "user").map(m => m.content);
    const validationError = getValidationMessage(content, recentUserMessages);
    if (validationError) {
      alert(validationError);
      return;
    }

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
      let convId = currentConvId;
      if (!convId) {
        const convRes = await fetch("/api/student/sessions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: designData?.game_name || "新对话" }) });
        if (convRes.ok) { const conv = await convRes.json(); convId = conv.id; setCurrentConvId(conv.id); }
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newRaw.map((m) => ({ role: m.role, content: m.content })), currentCode: htmlCode || undefined, sessionId: convId }),
        signal: AbortSignal.timeout(120000), // 2分钟超时
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("请求失败：" + (err.error || `HTTP ${res.status}`));
        setLoading(false); sendingRef.current = false; return;
      }
      await processStream(res);
    } catch (e: any) {
      console.error("发送失败:", e);
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        alert("AI回复超时，请稍后重试");
      } else {
        alert("发送失败：" + (e.message || "未知错误"));
      }
    } finally { setLoading(false); sendingRef.current = false; }
  };

  const handleSend = async () => { if (input.trim()) await handleSendWithContent(input.trim()); };

  const processStream = async (res: Response) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";
    let fenceCount = 0;
    let lastDisplayLen = 0;
    let hasError = false;

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
          if (parsed.error) {
            console.error("AI Error:", parsed.error);
            setMessages((prev) => [...prev, { role: "assistant", content: `  ${parsed.error}` }]);
            hasError = true;
            return;
          }
          if (parsed.content) {
            assistantContent += parsed.content;
            const fenceMatches = parsed.content.match(/```/g);
            if (fenceMatches) fenceCount += fenceMatches.length;
            const inCodeBlock = fenceCount % 2 !== 0;
            if (inCodeBlock) {
              // 在代码块内：只更新代码预览，不更新聊天
              setIsCoding(true);
              setViewMode("code");
              const code = extractHtmlCode(assistantContent);
              if (code) setLiveCode(code);
            } else {
              // 在代码块外：更新聊天显示（仅文字）
              const textOnly = extractTextOnly(assistantContent);
              if (textOnly && textOnly.length - lastDisplayLen > 20) {
                lastDisplayLen = textOnly.length;
                setMessages((prev) => { const msgs = [...prev]; const lastIdx = msgs.length - 1; if (lastIdx >= 0 && msgs[lastIdx].role === "assistant" && (msgs[lastIdx] as any)._s) { msgs[lastIdx] = { role: "assistant", content: textOnly, _s: true } as any; } else { msgs.push({ role: "assistant", content: textOnly, _s: true } as any); } return msgs; });
              }
            }
          }
        } catch {}
      }
    }

    if (hasError) return;

    setIsCoding(false);
    const finalCode = extractHtmlCode(assistantContent);
    const finalText = extractTextOnly(assistantContent);

    // 显示最终消息（保留AI的完整回复）
    const displayText = finalText || (finalCode ? "游戏代码已生成，请查看右侧预览区！" : "  AI暂时无法回复，请稍后重试");
    setMessages((prev) => { const msgs = [...prev]; const lastIdx = msgs.length - 1; if (lastIdx >= 0 && msgs[lastIdx].role === "assistant" && (msgs[lastIdx] as any)._s) { msgs[lastIdx] = { role: "assistant", content: displayText }; } else { msgs.push({ role: "assistant", content: displayText }); } return msgs; });
    setRawMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    if (finalCode) {
      setHtmlCode(finalCode);
      setLiveCode(finalCode);
      setViewMode("game");
      setGameStarted(false);
      // 保存HTML代码到对话
      if (currentConvId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            await fetch("/api/student/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ id: currentConvId, html_code: finalCode }),
            });
          }
        } catch {}
      }
    }
  };

  const handleUpload = async () => {
    if (!htmlCode || !gameTitle.trim()) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ game_title: gameTitle.trim(), html_code: htmlCode }) });
      if (res.ok) {
        alert("  上传成功！");
        window.location.href = "/student?module=reflection";
      } else {
        const err = await res.json().catch(() => ({}));
        alert("上传失败：" + (err.error || "未知错误"));
      }
    } catch (e: any) { alert("上传异常：" + e.message); } finally { setSaving(false); }
  };

  const handleDownload = () => {
    if (!htmlCode) return;
    const blob = new Blob([htmlCode], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${gameTitle || "游戏"}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    alert("  下载成功！点击确定跳转到反思页面");
    router.push("/student?module=reflection");
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
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">  我的对话</span>
          <button onClick={() => { setCurrentConvId(null); setMessages([]); setRawMessages([]); setHtmlCode(""); setLiveCode(""); setGameStarted(false); }}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">+ 新对话</button>
        </div>
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
          {/* 设计图展示 - 始终显示 */}
          {designLoaded && designData && (designData.design_image || (designData.image_history && designData.image_history.length > 0)) && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-indigo-50 rounded-2xl rounded-bl-md p-3 border border-indigo-200">
                <p className="text-sm font-bold text-indigo-700 mb-2">  你在构思阶段的设计</p>
                {/* AI生成的图片历史 - 可选择 */}
                {designData.image_history && designData.image_history.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-indigo-600 mb-1.5">点击选择一张作为游戏画面：</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {designData.image_history.map((img: any, i: number) => (
                        <button key={i} onClick={() => setSelectedImage(img.url)}
                          className={`flex-shrink-0 w-24 h-16 rounded-lg border-2 overflow-hidden transition ${selectedImage === img.url ? "border-indigo-500 ring-2 ring-indigo-300" : "border-indigo-200 hover:border-indigo-400"}`}>
                          <img
                            src={img.url}
                            alt={`v${i + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='64' fill='%23e5e7eb'%3E%3Crect width='96' height='64'/%3E%3Ctext x='48' y='32' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='11'%3E已过期%3C/text%3E%3C/svg%3E";
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* 选中的图片大图 */}
                {selectedImage && (
                  <div className="mb-2">
                    <p className="text-xs text-indigo-600 mb-1">已选择：</p>
                    <img
                      src={selectedImage}
                      alt="选中的设计图"
                      className="w-full max-w-sm rounded-lg border border-indigo-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        setSelectedImage(null);
                      }}
                    />
                  </div>
                )}
                {/* 单张设计图（如果没有历史） */}
                {!designData.image_history?.length && designData.design_image && (
                  <img
                    src={designData.design_image}
                    alt="设计图"
                    className="w-full max-w-xs rounded-lg border border-indigo-200 mb-2"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                {/* AI描述 */}
                {designData.ai_prompt && (
                  <p className="text-xs text-indigo-600 mt-1">  AI描述：{designData.ai_prompt}</p>
                )}
              </div>
            </div>
          )}
          {messages.map((msg, i) => {
            // 助手消息：提取纯文本，跳过空消息
            const displayContent = msg.role === "assistant" ? extractTextOnly(msg.content) : msg.content;
            if (msg.role === "assistant" && !displayContent) return null;

            return (
              <div key={`${i}-${msg.content.length}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-14 h-14 flex-shrink-0 mr-3 mt-1">
                    <XiaozhiAvatar state={i === messages.length - 1 && loading ? "thinking" : i === messages.length - 1 && htmlCode ? "success" : "idle"} />
                  </div>
                )}
                <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai max-w-[75%]"}>
                  {msg.role === "assistant" ? formatAIMessage(displayContent) : displayContent.split("\n").map((line, j) => <p key={j} className={j > 0 ? "mt-1" : ""}>{line}</p>)}
                </div>
              </div>
            );
          })}
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
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 whitespace-nowrap">预览</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
            <button onClick={() => setViewMode("code")} className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${viewMode === "code" ? "bg-white shadow" : "text-gray-500"}`}>代码</button>
            <button onClick={() => setViewMode("game")} className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${viewMode === "game" ? "bg-white shadow" : "text-gray-500"}`}>游戏</button>
          </div>
          <span className="text-sm text-gray-400 flex-shrink-0">{htmlCode ? `${htmlCode.split("\n").length}行` : ""}</span>
          <input value={gameTitle} onChange={(e) => setGameTitle(e.target.value)} placeholder="输入游戏名称" className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none" />
          <button onClick={handleUpload} disabled={!htmlCode || !gameTitle.trim() || saving} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 flex-shrink-0">{saving ? "..." : "上传"}</button>
          <button onClick={handleDownload} disabled={!htmlCode} className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 flex-shrink-0">下载</button>
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
            <div className="h-full flex items-center justify-center p-2 overflow-hidden">
              {htmlCode ? (gameStarted ? (
                <iframe
                  srcDoc={htmlCode}
                  className="rounded-xl"
                  sandbox="allow-scripts allow-same-origin"
                  scrolling="no"
                  style={{ border: 'none', display: 'block', width: '800px', height: '600px', maxWidth: '100%', maxHeight: '100%' }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center cursor-pointer rounded-xl" onClick={() => setGameStarted(true)}>
                  <div className="text-center">
                    <div className="text-7xl mb-4 animate-bounce">▶️</div>
                    <p className="text-2xl font-bold text-indigo-600">先来玩一玩游戏吧！</p>
                    <p className="text-sm text-indigo-400">点击开始试玩</p>
                  </div>
                </div>
              )) : (
                <div className="text-center text-gray-400">
                  <p className="text-6xl mb-4"> </p>
                  <p>生成游戏后在这里预览</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
