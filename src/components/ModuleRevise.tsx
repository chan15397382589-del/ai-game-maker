"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";

interface Props {
  userId: string;
}

interface PeerReview {
  id: number;
  reviewer_id: string;
  q1_enjoy: string;
  q2_suggestion: string;
  q3_bug: string;
  created_at: string;
  reviewer?: { name: string; student_id: string };
  item?: { game_title: string; html_code: string };
}

export default function ModuleRevise({ userId }: Props) {
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [htmlCode, setHtmlCode] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);

  // 聊天状态
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // 获取评价
      const reviewsRes = await fetch("/api/student/peer-reviews?mode=my_reviews", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reviewsRes.ok) {
        const reviewsData = await reviewsRes.json();
        setReviews(reviewsData);
      }

      // 获取最新对话的游戏代码
      const convsRes = await fetch("/api/student/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (convsRes.ok) {
        const convs = await convsRes.json();
        if (convs.length > 0) {
          const latest = convs[0];
          if (latest.html_code) {
            setHtmlCode(latest.html_code);
            setGameTitle(latest.title || "我的游戏");
            setConversationId(latest.id);
          }
        }
      }

      // 初始化欢迎消息
      setMessages([{
        role: "assistant",
        content: "你好！我已经看到了同学给你的评价。你想根据哪些建议来修改游戏呢？告诉我你的想法吧！",
      }]);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // 构建包含评价信息的系统消息
      const reviewSummary = reviews.map((r, i) =>
        `评价${i + 1}（${r.reviewer?.name || "匿名"}）：\n- 好玩之处：${r.q1_enjoy}\n- 建议：${r.q2_suggestion}${r.q3_bug ? `\n- 问题：${r.q3_bug}` : ""}`
      ).join("\n\n");

      const systemContext = `学生正在根据同学评价修改游戏。以下是同学的评价：\n\n${reviewSummary}\n\n当前游戏代码：\n\`\`\`html\n${htmlCode}\n\`\`\`\n\n请根据同学的建议帮助学生修改游戏。`;

      const allMessages = [
        ...messages,
        { role: "user", content: userMsg },
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: allMessages,
          currentCode: htmlCode,
          sessionId: conversationId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, { role: "assistant", content: `  错误：${err.error || "请求失败"}` }]);
        return;
      }

      // 处理流式响应
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

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
            if (parsed.content) fullContent += parsed.content;
          } catch (err) { console.error(err); }
        }
      }

      if (fullContent) {
        // 提取代码
        const codeMatch = fullContent.match(/```html\s*\n([\s\S]*?)```/);
        if (codeMatch) {
          const newCode = codeMatch[1].trim();
          setHtmlCode(newCode);
          // 保存新代码
          if (conversationId) {
            await fetch("/api/student/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ id: conversationId, html_code: newCode }),
            });
          }
        }

        // 提取文本（去掉代码块）
        const textOnly = fullContent
          .replace(/```html[\s\S]*?```/g, "")
          .replace(/```[\s\S]*?```/g, "")
          .trim();

        if (textOnly) {
          setMessages((prev) => [...prev, { role: "assistant", content: textOnly }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: "  游戏代码已更新！请在右侧预览区查看效果。" }]);
        }
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `  错误：${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-3">
      {/* 左侧：同学评价 + 聊天 */}
      <div className="w-96 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
        {/* 评价摘要 */}
        <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-amber-500 to-orange-500">
          <h3 className="text-sm font-bold text-white mb-2">  同学评价</h3>
          {reviews.length === 0 ? (
            <p className="text-xs text-amber-100">暂无评价</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {reviews.map((r, i) => (
                <div key={r.id} className="text-xs p-2.5 bg-white/90 rounded-lg backdrop-blur-sm">
                  <p className="font-bold text-gray-700 mb-1">同学 {i + 1}</p>
                  <p className="text-green-700">  {r.q1_enjoy}</p>
                  <p className="text-blue-700">  {r.q2_suggestion}</p>
                  {r.q3_bug && <p className="text-orange-700">  {r.q3_bug}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 聊天区 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-gray-100 bg-purple-50 flex items-center gap-2">
            <div className="w-8 h-8"><XiaozhiAvatar state={sending ? "thinking" : "idle"} /></div>
            <div>
              <p className="text-xs font-bold text-purple-700">小智老师</p>
              <p className="text-[10px] text-purple-500">根据同学建议修改游戏</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                  msg.role === "user"
                    ? "bg-indigo-500 text-white rounded-br-md"
                    : "bg-gray-50 text-gray-700 rounded-bl-md border border-gray-100"
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="说说你想怎么改..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                disabled={sending}
              />
              <button onClick={handleSend} disabled={sending || !input.trim()} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">发送</button>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：游戏预览 */}
      <div className="flex-1 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">  {gameTitle || "游戏预览"}</h3>
          <button onClick={() => setGameStarted(!gameStarted)} className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition backdrop-blur-sm">
            {gameStarted ? "  重新开始" : "▶️ 开始游戏"}
          </button>
        </div>
        <div className="flex-1 relative bg-gray-900">
          {htmlCode ? (
            gameStarted ? (
              <iframe
                srcDoc={htmlCode}
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin"
                scrolling="no"
                style={{ border: "none" }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 cursor-pointer" onClick={() => setGameStarted(true)}>
                <div className="text-center">
                  <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                    <span className="text-4xl ml-1">▶️</span>
                  </div>
                  <p className="text-xl font-bold text-white">点击试玩你的游戏</p>
                  <p className="text-sm text-indigo-200 mt-1">修改后可以实时预览</p>
                </div>
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <p>暂无游戏代码</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
