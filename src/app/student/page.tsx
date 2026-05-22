"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";
import ClassificationModal from "@/components/ClassificationModal";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";

// ============================================================
// 工具函数：获取认证 token
// ============================================================
async function getToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    // token 可能过期，尝试刷新
    await supabase.auth.refreshSession();
    const { data: { session: s2 } } = await supabase.auth.getSession();
    return s2?.access_token || "";
  } catch {
    // refresh token 无效或过期，清除本地存储
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.startsWith("supabase."))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    return "";
  }
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
    .replace(new RegExp("@image#\\d+[:：][^\\s\\n]+", "g"), "")
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

// 过滤 AI 可能输出的图片占位符标记
const cleanImageMarkers = (content: string): string => {
  return content.replace(new RegExp("@image#\\d+[:：][^\\s\\n]+", "g"), "").trim();
};

const extractHtmlCode = (content: string): string | null => {
  const cleaned = cleanImageMarkers(content);

  // 匹配 ```html ... ``` 代码块（使用更可靠的方式：从 ```html 后开始，匹配到最后一个 ```）
  const htmlFenceMatch = cleaned.match(/```html\s*([\s\S]+)/i);
  if (htmlFenceMatch) {
    const afterFence = htmlFenceMatch[1];
    // 查找闭合的 ```
    const closeIdx = afterFence.lastIndexOf("```");
    if (closeIdx > 0) {
      const code = afterFence.slice(0, closeIdx).trim();
      if (code) return code;
    } else {
      // 未闭合的代码块，也返回已有内容（流式输出可能还没结束）
      const code = afterFence.trim();
      if (code && code.includes("<")) return code;
    }
  }

  // 匹配无语言标记的 ``` ... ``` 代码块
  const genericFenceMatch = cleaned.match(/```\s*([\s\S]+)/);
  if (genericFenceMatch) {
    const afterFence = genericFenceMatch[1];
    const closeIdx = afterFence.lastIndexOf("```");
    if (closeIdx > 0) {
      const code = afterFence.slice(0, closeIdx).trim();
      if (code && /<\w/.test(code)) return code;
    }
  }

  // 如果没有代码块标记，但内容看起来是完整 HTML
  const trimmed = cleaned.trim();
  if (/^<!DOCTYPE\s+html/i.test(trimmed)) return trimmed;
  if (/^<html[\s>]/i.test(trimmed)) return trimmed;
  if (/^<head[\s>]/i.test(trimmed)) return trimmed;
  if (/^<body[\s>]/i.test(trimmed)) return trimmed;

  // 兜底：如果内容中有大量 HTML 标签，尝试提取
  const htmlLike = /<html[\s\S]*<\/html>/i.exec(trimmed);
  if (htmlLike) return htmlLike[0];

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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// 对话文档类型定义
// ============================================================
interface Conversation {
  id: string;
  title: string;
  html_code: string | null;
  has_game: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
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
  const [viewMode, setViewMode] = useState<"code" | "game">("game");

  // 对话文档管理
  const [currentConvId, setCurrentConvId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reflectionPhase, setReflectionPhase] = useState(false);
  const [reflectionData, setReflectionData] = useState<Record<string, string>>({});
  const [reflectionSubmitted, setReflectionSubmitted] = useState(false);
  const [processHint, setProcessHint] = useState<string | null>(null);

  // 历史游戏快照
  const [gameHistory, setGameHistory] = useState<{ id: number; html_code: string; conversation_id: string; created_at: string }[]>([]);

  // 语音输入状态
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 分类评估弹窗
  const [showClassification, setShowClassification] = useState(false);
  const [classificationDone, setClassificationDone] = useState(false);
  const [srlGroup, setSrlGroup] = useState<string>("");

  // 历史记录栈（支持多步回退）
  const [historyStack, setHistoryStack] = useState<{
    messages: { role: string; content: string }[];
    rawMessages: { role: string; content: string }[];
    htmlCode: string;
  }[]>([]);

  // 前进栈（撤销后可以重做）
  const [forwardStack, setForwardStack] = useState<{
    messages: { role: string; content: string }[];
    rawMessages: { role: string; content: string }[];
    htmlCode: string;
  }[]>([]);

  // 推导当前游戏创作阶段
  const processStep: "ideation" | "creation" | "done" =
    reflectionSubmitted ? "done" : htmlCode ? "creation" : "ideation";

  const processSteps = [
    { key: "ideation", icon: "💡", label: "构思", hint: "告诉小智老师你想做什么游戏。想想——什么类型的游戏？里面有什么角色？怎么玩？" },
    { key: "creation", icon: "🔧", label: "创作", hint: "小智老师帮你做出了游戏！现在你可以试玩，然后告诉他想改哪里——太快了？太小了？颜色不好看？" },
    { key: "done", icon: "🎉", label: "完成", hint: "你的游戏做好了！上传到老师那里，然后说说你的创作故事～" },
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  // 保存完整原始消息（含代码），用于发送给 API
  const initialMessage = "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？我可以帮你做：\n🎯 迷宫游戏\n🐹 打地鼠\n🍎 接东西游戏\n🏃 跑酷游戏\n🎨 或者其他你喜欢的！\n\n告诉我你的想法吧！";
  const rawMessagesRef = useRef<{ role: string; content: string }[]>([
    { role: "assistant", content: initialMessage },
  ]);
  const retryCountRef = useRef(0); // 重试计数器

  // 初始化：检查登录 + 加载对话列表 + 检查分类
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        const token = await getToken();
        if (token) {
          await fetchConversations(token);
          await fetchGameHistory(token);
          // 检查是否已完成分类评估
          try {
            const res = await fetch("/api/student/classification", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const { done, data } = await res.json();
              setClassificationDone(done);
              if (done && data?.srl_group) setSrlGroup(data.srl_group);
              if (!done) {
                // 没有对话则先自动创建一个
                if (!currentConvId) {
                  const newConv = await createConversationInternal(token);
                  if (newConv) setCurrentConvId(newConv.id);
                }
                setShowClassification(true);
              }
            }
          } catch {}
        }
      } else {
        router.push("/login");
      }
      setCheckingAuth(false);
    }).catch(() => {
      router.push("/login");
    });
  }, []);

  // 初始化语音识别
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
      const recognition = new SpeechRecognition();
      recognition.lang = "zh-CN";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (codeScrollRef.current && isCoding) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [liveCode, isCoding]);

  // ============================================================
  // 对话文档 API 调用
  // ============================================================

  const fetchConversations = async (token?: string) => {
    setLoadingHistory(true);
    const t = token || await getToken();
    if (!t) { setLoadingHistory(false); return; }
    try {
      const res = await fetch("/api/student/sessions", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        const convs: Conversation[] = data || [];
        setConversations(convs);

        // 如果有对话文档，自动加载最新的一个
        if (convs.length > 0 && !currentConvId) {
          await loadConversation(convs[0].id, convs[0], t);
        }
      }
    } catch (err) {
      console.error("获取对话列表失败:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 获取历史游戏快照
  const fetchGameHistory = async (token?: string) => {
    const t = token || await getToken();
    if (!t) return;
    try {
      const res = await fetch("/api/student/game-snapshots", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setGameHistory(await res.json());
      }
    } catch (err) {
      console.error("获取游戏历史失败:", err);
    }
  };

  // 加载指定对话文档
  const loadConversation = async (convId: string, convData?: Conversation, token?: string) => {
    setLoadingSession(true);
    const t = token || await getToken();
    if (!t) { setLoadingSession(false); return; }

    try {
      const res = await fetch(`/api/student/messages?session_id=${encodeURIComponent(convId)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        const cleanedMessages = (data || []).map((msg: any) => ({
          ...msg,
          content: extractTextOnly(msg.content) || msg.content,
        }));

        setMessages(cleanedMessages.length > 0 ? cleanedMessages : [{
          role: "assistant",
          content: "这是你之前的对话，可以继续聊哦！告诉我你想修改什么吧！",
        }]);
        // 同时恢复原始消息（数据库存的是完整内容）
        rawMessagesRef.current = (data || []).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));

        setCurrentConvId(convId);
        setHistoryStack([]);
        setForwardStack([]);

        // 从对话文档恢复游戏代码
        const code = convData?.html_code || "";
        setHtmlCode(code);
        setGameStarted(false);
      }
    } catch (err) {
      console.error("加载对话失败:", err);
    } finally {
      setLoadingSession(false);
    }
  };

  // 创建新对话文档（内部使用）
  const createConversationInternal = async (token: string): Promise<Conversation | null> => {
    try {
      const res = await fetch("/api/student/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json();
      alert(err.error || "创建对话失败");
      return null;
    } catch {
      alert("创建对话失败");
      return null;
    }
  };

  // 新建对话
  const startNewConversation = async () => {
    if (conversations.length >= 2) {
      alert("每位学生最多只能有 2 个对话文档。请先删除一个旧文档，然后再创建新对话。");
      return;
    }

    const token = await getToken();
    if (!token) return;

    const newConv = await createConversationInternal(token);
    if (!newConv) return;

    setCurrentConvId(newConv.id);
    setHtmlCode("");
    setGameTitle("");
    setGameStarted(false);
    setHistoryStack([]);
    setForwardStack([]);

    // 首次创建对话时，先做分类评估
    if (!classificationDone) {
      setShowClassification(true);
      return;
    }

    setMessages([
      {
        role: "assistant",
        content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？\n\n1. 🎯 迷宫游戏\n2. 🐹 打地鼠\n3. 🍎 接东西游戏\n4. 🏃 跑酷游戏\n\n你也可以在下面输入自己的想法！",
      },
    ]);
    rawMessagesRef.current = [{
      role: "assistant",
      content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？\n\n1. 🎯 迷宫游戏\n2. 🐹 打地鼠\n3. 🍎 接东西游戏\n4. 🏃 跑酷游戏\n\n你也可以在下面输入自己的想法！",
    }];
    setConversations(prev => [newConv, ...prev]);
  };

  // 删除对话文档
  const deleteConversation = async (convId: string) => {
    if (deletingId) return;
    if (!confirm("确定要删除这个对话吗？删除后无法恢复。")) return;

    setDeletingId(convId);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch("/api/student/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: convId }),
      });

      if (res.ok) {
        const updated = conversations.filter(c => c.id !== convId);
        setConversations(updated);

        // 如果删除的是当前对话，切换到剩余的对话
        if (convId === currentConvId) {
          if (updated.length > 0) {
            await loadConversation(updated[0].id, updated[0]);
          } else {
            setCurrentConvId("");
            setHtmlCode("");
            setGameTitle("");
            setGameStarted(false);
            const resetMsg = [{
              role: "assistant",
              content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？\n\n1. 🎯 迷宫游戏\n2. 🐹 打地鼠\n3. 🍎 接东西游戏\n4. 🏃 跑酷游戏\n\n你也可以在下面输入自己的想法！",
            }];
            setMessages(resetMsg);
            rawMessagesRef.current = resetMsg;
          }
        }
      } else {
        alert("删除失败，请重试");
      }
    } catch {
      alert("删除失败，请重试");
    } finally {
      setDeletingId(null);
    }
  };

  // 静默更新对话文档（不显示错误）
  const updateConversationSilent = async (convId: string, updates: { title?: string; html_code?: string }) => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: convId, ...updates }),
      });

      if (res.ok) {
        const updated = await res.json();
        setConversations(prev => prev.map(c =>
          c.id === convId
            ? { ...c, ...updates, updated_at: updated.updated_at, has_game: !!updates.html_code }
            : c
        ));
      }
    } catch (err) {
      console.error("更新对话失败:", err);
    }
  };

  // ============================================================
  // 流式响应处理（共享逻辑）
  // ============================================================

  const processStream = async (
    response: Response,
    existingCode: string,
    convId: string
  ) => {
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
          // 处理服务端流错误事件
          if (parsed.error) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: "抱歉，AI 回复中断了，请再试一次！😅",
              };
              return updated;
            });
            break;
          }
          const content = parsed.content || "";
          assistantContent += content;

          if (content.includes("```")) {
            const count = (assistantContent.match(/```/g) || []).length;
            insideCodeBlock = count % 2 === 1;
            setIsCoding(insideCodeBlock);
            // 进入代码块时自动切换到代码视图
            if (insideCodeBlock) {
              setViewMode("code");
            }
          }

          if (insideCodeBlock) {
            setLiveCode(extractAllCode(assistantContent));
          }

          const textOnly = extractTextOnly(assistantContent);
          const displayText = textOnly || (insideCodeBlock ? "✨ 小智老师正在编写游戏代码，请稍等..." : "");
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

    // 流结束：更新最终显示 + 更新原始消息列表
    const finalText = extractTextOnly(assistantContent);
    // 保存完整原始内容到 rawMessagesRef
    rawMessagesRef.current = [...rawMessagesRef.current, { role: "assistant", content: assistantContent }];
    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        content: finalText || "✅ 游戏代码已生成，请在右侧预览！",
      };
      return updated;
    });

    // 检测反思阶段触发
    if (assistantContent.includes("[REFLECTION_START]") && !reflectionSubmitted) {
      setTimeout(() => {
        setReflectionPhase(true);
        setReflectionData({});
      }, 1500);
    }

    // 提取游戏代码
    const code = extractHtmlCode(assistantContent);
    if (code) {
      setHtmlCode(code);
      setGameStarted(false);
      // 代码提取成功，重置重试计数
      retryCountRef.current = 0;
      // 代码生成完成，立即切换到游戏视图
      setViewMode("game");
      // 自动保存游戏代码到对话文档
      if (convId) {
        updateConversationSilent(convId, { html_code: code });
        fetchGameHistory();
      }
    } else {
      // 如果已有游戏但 AI 没输出新代码，静默自动重试（最多1次）
      if (existingCode && retryCountRef.current < 1) {
        retryCountRef.current++;
        setTimeout(async () => {
          const retryToken = await getToken();
          if (!retryToken) return;
          try {
            // 构建重试消息：使用 rawMessagesRef + 追加 user 角色的代码上下文（确保最后是 user）
            const retryMessages = [
              ...rawMessagesRef.current.map((m) => ({ role: m.role, content: m.content })),
              {
                role: "user",
                content: `请基于以下当前游戏代码进行修改，输出完整的HTML代码：\n\`\`\`html\n${existingCode}\n\`\`\``,
              },
            ];
            const retryRes = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${retryToken}` },
              body: JSON.stringify({
                messages: retryMessages,
                userId,
                sessionId: convId,
                currentCode: existingCode,
                group: srlGroup || undefined,
              }),
            });
            if (!retryRes.ok) return;
            const r = retryRes.body?.getReader();
            if (!r) return;
            const d = new TextDecoder();
            let t = "";
            while (true) {
              const { done, value } = await r.read();
              if (done) break;
              const chunk = d.decode(value, { stream: true });
              for (const line of chunk.split("\n")) {
                const tr = line.trim();
                if (!tr.startsWith("data:") || tr === "data: [DONE]") continue;
                try { t += JSON.parse(tr.slice(5).trim()).content || ""; } catch {}
              }
            }
            const c = extractHtmlCode(t);
            if (c) {
              setHtmlCode(c);
              setGameStarted(false);
              if (convId) { updateConversationSilent(convId, { html_code: c }); fetchGameHistory(); }
            }
          } catch {}
        }, 500);
      }
    }

    setIsCoding(false);
    setLiveCode("");
  };

  // ============================================================
  // 发送消息（统一入口）
  // ============================================================

  const doSend = async (text: string) => {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true;

    const token = await getToken();

    // 如果还没有对话文档，自动创建一个
    let convId = currentConvId;
    if (!convId) {
      const newConv = await createConversationInternal(token);
      if (!newConv) return;
      convId = newConv.id;
      setCurrentConvId(convId);
      setConversations(prev => [newConv, ...prev]);
    }

    // 如果对话标题还是默认的，更新为用户第一条消息
    const currentConv = conversations.find(c => c.id === convId);
    if (currentConv?.title === "新对话") {
      const title = text.substring(0, 20) + (text.length > 20 ? "..." : "");
      updateConversationSilent(convId, { title });
    }

    // 保存当前状态到历史栈（支持返回上一步）
    setHistoryStack((prev) => [
      ...prev.slice(-19), // 最多保留 20 步
      {
        messages: [...messages],
        rawMessages: [...rawMessagesRef.current],
        htmlCode,
      },
    ]);
    // 发送新消息后清空前进栈
    setForwardStack([]);

    const userMessage = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    // 同时更新原始消息列表（保留完整内容）
    rawMessagesRef.current = [...rawMessagesRef.current, userMessage];
    setInput("");
    setLoading(true);
    setIsCoding(false);
    setLiveCode("");
    // 如果已有游戏代码，用户发消息时切换到代码视图（等待修改）
    if (htmlCode) {
      setViewMode("code");
      setGameStarted(false);
    }

    // 构建发给 API 的消息列表（使用原始消息，保留完整上下文）
    let apiMessages = rawMessagesRef.current.map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          userId,
          sessionId: convId,
          currentCode: htmlCode || undefined,
          group: srlGroup || undefined,
        }),
      });

      if (!response.ok) throw new Error("请求失败");

      await processStream(response, htmlCode, convId);
    } catch (error) {
      console.error("发送消息失败:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，我遇到了一点问题，请再试一次！😅" },
      ]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  // ============================================================
  // 事件处理
  // ============================================================

  const sendMessage = () => doSend(input);

  // 语音输入 — 留下 baseText 基准
  const voiceBaseRef = useRef("");

  const startListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    setIsListening(true);
    voiceBaseRef.current = input;

    let finalText = ""; // 累积的最终文本

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = (event.results[i][0].transcript || "").trim();
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      // 去重：检测明显的重复模式（相同片段连续出现）
      const combined = (finalText + interim).trim();
      const deduped = deduplicateSpeech(combined);
      setInput((voiceBaseRef.current + " " + deduped).trim());
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      // 结束时将最终结果追加到 input
      if (finalText.trim()) {
        setInput((prev) => {
          const base = voiceBaseRef.current.trim();
          const prevWithoutBase = prev.replace(base, "").trim();
          return (base + " " + prevWithoutBase).trim();
        });
      }
      setIsListening(false);
    };

    recognition.start();
  };

  const stopListening = () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  // 语音去重：检测并修复重复片段
  const deduplicateSpeech = (text: string): string => {
    if (!text || text.length < 2) return text;
    // 检测连续重复（如 "你好你好你好"）
    for (let half = Math.floor(text.length / 2); half >= 2; half--) {
      const firstHalf = text.substring(0, half);
      const secondHalf = text.substring(half, half * 2);
      if (firstHalf === secondHalf) {
        return deduplicateSpeech(text.substring(0, half));
      }
    }
    // 常见错误纠正
    return text
      .replace(/三遍三遍三遍/g, "")
      .replace(/(.{1,5})\1{2,}/g, "$1") // 短片段重复3次以上
      .trim();
  };

  // 返回上一步
  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    // 保存当前状态到前进栈
    setForwardStack((prev) => [...prev, {
      messages: [...messages],
      rawMessages: [...rawMessagesRef.current],
      htmlCode,
    }]);
    setHistoryStack((prev) => prev.slice(0, -1));
    setMessages(prev.messages);
    rawMessagesRef.current = prev.rawMessages;
    setHtmlCode(prev.htmlCode);
    setGameStarted(false);
  };

  // 回到下一步
  const handleRedo = () => {
    if (forwardStack.length === 0) return;
    const next = forwardStack[forwardStack.length - 1];
    // 保存当前状态到历史栈
    setHistoryStack((prev) => [...prev, {
      messages: [...messages],
      rawMessages: [...rawMessagesRef.current],
      htmlCode,
    }]);
    setForwardStack((prev) => prev.slice(0, -1));
    setMessages(next.messages);
    rawMessagesRef.current = next.rawMessages;
    setHtmlCode(next.htmlCode);
    setGameStarted(false);
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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          game_title: gameTitle,
          html_code: htmlCode,
        }),
      });
      if (res.ok) {
        setGameTitle("");
        setReflectionPhase(true);
        setReflectionData({});
        setReflectionSubmitted(false);
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

  // ============================================================
  // 登录检查中显示加载
  // ============================================================
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

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 左侧导航栏 */}
      <div className="w-44 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* 创作过程 */}
        <div className="flex items-center justify-center gap-1 py-3 px-2">
          {processSteps.map((s) => {
          const isActive = processStep === s.key;
          const isPast = processSteps.findIndex(p => p.key === processStep) > processSteps.findIndex(p => p.key === s.key);
          return (
            <button
              key={s.key}
              onClick={() => setProcessHint(processHint === s.key ? null : s.key)}
              className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition relative ${
                isActive ? "bg-indigo-100 text-indigo-600" :
                isPast ? "bg-green-50 text-green-500" :
                "text-gray-300 hover:bg-gray-50 hover:text-gray-400"
              }`}
              title={s.label}
            >
              <span className="text-lg leading-none">{s.icon}</span>
              <span className="text-[9px] font-medium mt-0.5">{s.label}</span>
              {isActive && <div className="absolute -right-2.5 w-1 h-5 bg-indigo-500 rounded-full" />}
              {isPast && <div className="absolute top-0.5 right-0.5 text-[8px]">✓</div>}
            </button>
          );
        })}
        {/* 提示弹窗 */}
        {processHint && (
          <div className="absolute left-full top-4 ml-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 p-3 z-30">
            <p className="text-xs text-gray-600 leading-relaxed">
              {processSteps.find(s => s.key === processHint)?.hint}
            </p>
            <button
              onClick={() => setProcessHint(null)}
              className="mt-2 text-[10px] text-indigo-500 hover:text-indigo-700"
            >知道了</button>
          </div>
        )}
        </div>

        {/* 分隔线 */}
        <div className="border-t border-gray-200 mx-2" />

        {/* 我的对话 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 flex items-center justify-between">
            <span>📂 我的对话</span>
            <span className="text-gray-300">{conversations.length}/2</span>
          </div>

          {/* 新建对话按钮 */}
          <div className="px-2 pb-2">
            <button
              onClick={startNewConversation}
              disabled={conversations.length >= 2}
              className={`w-full py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                conversations.length >= 2
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600"
              }`}
            >
              {conversations.length >= 2 ? "已满（2个）" : "➕ 新建游戏"}
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-1">想创建新游戏？点这里</p>
          </div>

          {/* 对话列表 */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {loadingHistory ? (
              <p className="text-gray-400 text-center py-2 text-[10px]">加载中...</p>
            ) : conversations.length === 0 ? (
              <p className="text-gray-400 text-center py-2 text-[10px]">暂无对话</p>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center rounded-lg transition group ${
                      currentConvId === conv.id
                        ? "bg-indigo-100 text-indigo-700"
                        : "hover:bg-gray-100 text-gray-600"
                    }`}
                  >
                    <div
                      onClick={() => {
                        if (loadingSession || conv.id === currentConvId) return;
                        loadConversation(conv.id, conv);
                      }}
                      className="flex-1 min-w-0 px-2 py-1.5 cursor-pointer"
                    >
                      <p className="text-xs font-medium truncate">
                        {conv.has_game ? "🎮 " : "📝 "}{conv.title}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {conv.message_count} 条 · {new Date(conv.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      disabled={deletingId === conv.id}
                      className="text-gray-300 hover:text-red-500 p-1 transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                      title="删除此对话"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 删除提示 */}
          {conversations.length >= 2 && (
            <p className="text-[10px] text-gray-300 text-center py-1 px-2">
              💡 达到上限，可删除旧对话后新建
            </p>
          )}
        </div>

        {/* 分隔线 */}
        <div className="border-t border-gray-200 mx-2" />

        {/* 历史游戏 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-medium text-gray-500">
            🎮 历史游戏 <span className="text-gray-300">({gameHistory.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {gameHistory.length === 0 ? (
              <p className="text-[10px] text-gray-400 text-center py-2">还没有生成游戏</p>
            ) : (
              <div className="space-y-0.5">
                {gameHistory.map((snap, idx) => (
                  <div
                    key={snap.id}
                    onClick={() => {
                      setHtmlCode(snap.html_code);
                      setGameStarted(false);
                      setViewMode("game");
                    }}
                    className="px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 text-gray-600 transition"
                  >
                    <p className="text-xs font-medium truncate">
                      🎮 版本 {gameHistory.length - idx}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(snap.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex flex-col flex-1 border-r border-gray-200 bg-white">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-indigo-600 text-white">
          <h1 className="text-lg font-bold">AI 游戏创作课堂</h1>
          {historyStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="text-sm bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1 rounded-lg transition flex items-center gap-1"
              title="返回上一步"
            >
              ↩ 上一步
            </button>
          )}
          {forwardStack.length > 0 && (
            <button
              onClick={handleRedo}
              className="text-sm bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1 rounded-lg transition flex items-center gap-1"
              title="回到下一步"
            >
              下一步 ↪
            </button>
          )}
          <button
            onClick={() => router.push("/student/reviews")}
            className="ml-auto text-sm bg-white text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg transition"
          >
            👥 同学作品
          </button>
          <button
            onClick={() => {
              router.push("/login?action=switch");
            }}
            className="text-sm bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded-lg transition"
          >
            退出登录
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
          {/* 小智老师形象 - 左上角 */}
          <div className="absolute top-3 left-3 w-16 h-16 z-10">
            <XiaozhiAvatar state={loading || isCoding ? "thinking" : htmlCode ? "success" : "idle"} />
          </div>
          {messages.map((msg, i) => (
            <div
              key={`msg-${i}-${msg.role}-${msg.content.length}`}
              className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"} ${i === 0 ? "ml-20" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 flex-shrink-0">
                  <XiaozhiAvatar state="idle" />
                </div>
              )}
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
            {voiceSupported && (
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={loading}
                className={`px-3 py-2 rounded-xl text-lg transition flex-shrink-0 ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-white text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300"
                } disabled:opacity-50`}
                title={isListening ? "点击停止" : "语音输入"}
              >
                🎤
              </button>
            )}
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
      <div className="flex flex-col flex-1 bg-gray-50">
        {/* 标题栏 + Tab切换 + 上传/下载 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
          <h2 className="text-base font-bold text-gray-800 whitespace-nowrap">预览</h2>

          {/* 代码 / 游戏 Tab 切换 */}
          <div className="flex flex-row rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setViewMode("code")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                viewMode === "code"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              代码
            </button>
            <button
              onClick={() => setViewMode("game")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                viewMode === "game"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              游戏
            </button>
          </div>

          <input
            type="text"
            value={gameTitle}
            onChange={(e) => setGameTitle(e.target.value)}
            placeholder="游戏名称"
            className="input-field w-20 text-xs px-2 py-1"
          />
          <button
            onClick={handleUpload}
            disabled={!htmlCode || !gameTitle.trim() || saving}
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded-lg text-xs font-medium transition disabled:opacity-50 whitespace-nowrap"
            title="上传到教师管理后台"
          >
            {saving ? "..." : "📤 上传"}
          </button>
          <button
            onClick={handleDownload}
            disabled={!htmlCode}
            className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-lg text-xs font-medium transition disabled:opacity-50 whitespace-nowrap"
            title="下载为 HTML 文件"
          >
            ⬇️ 下载
          </button>
        </div>

        {/* 代码视图 */}
        {viewMode === "code" && (
          <div className="flex-1 min-h-0 flex flex-col p-4">
            {isCoding || liveCode || htmlCode ? (
              <div className="flex-1 min-h-0 bg-gray-900 rounded-2xl overflow-hidden flex flex-col shadow-lg">
                {/* 代码编辑器顶栏 */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full ${isCoding ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}></div>
                  <span className="text-gray-400 text-xs font-mono">
                    {isCoding ? "正在编写代码..." : "game.html"}
                  </span>
                  <span className="ml-auto text-gray-600 text-xs font-mono">
                    {(liveCode || htmlCode).split("\n").length} 行
                  </span>
                </div>
                {/* 代码内容 */}
                <div
                  ref={codeScrollRef}
                  className="flex-1 min-h-0 overflow-hidden relative"
                >
                  <div className="absolute inset-0 overflow-y-auto p-4 font-mono text-xs leading-5">
                    {(liveCode || htmlCode).split("\n").map((line, i) => (
                      <div key={i} className="flex">
                        <span className="text-gray-600 w-8 text-right mr-3 select-none flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-gray-300 whitespace-pre break-all">{line}</span>
                      </div>
                    ))}
                    {isCoding && (
                      <span className="inline-block w-1.5 h-3.5 bg-green-400 animate-pulse ml-0.5 align-middle"></span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-5xl mb-3">&lt;/&gt;</p>
                  <p className="text-sm">和 AI 对话来生成游戏代码</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 游戏视图 */}
        {viewMode === "game" && (
          <div className="flex-1 min-h-0 p-4">
            {htmlCode ? (
              gameStarted ? (
                <iframe
                  key={htmlCode}
                  srcDoc={htmlCode}
                  title="游戏预览"
                  className="w-full h-full rounded-2xl bg-white shadow-inner"
                  sandbox="allow-scripts" scrolling="no"
                />
              ) : (
                <div
                  className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center cursor-pointer hover:from-indigo-100 hover:to-purple-100 transition"
                  onClick={() => setGameStarted(true)}
                >
                  <div className="text-center">
                    <div className="text-7xl mb-4 animate-bounce">▶️</div>
                    <p className="text-2xl font-bold text-indigo-600 mb-2">开始游戏</p>
                    <p className="text-sm text-indigo-400">点击运行游戏</p>
                  </div>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-6xl mb-4">🎮</p>
                  <p className="text-lg">和 AI 对话，生成你的第一个游戏吧！</p>
                  <p className="text-sm mt-2 text-gray-300">生成的游戏代码会自动显示在这里</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* 反思弹窗 */}
      {/* 分类评估弹窗 */}
      {showClassification && currentConvId && (
        <ClassificationModal
          convId={currentConvId}
          onComplete={async () => {
            setClassificationDone(true);
            setShowClassification(false);
            // 获取分组结果
            try {
              const token = await getToken();
              const res = await fetch("/api/student/classification", {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const { data } = await res.json();
                if (data?.srl_group) setSrlGroup(data.srl_group);
              }
            } catch {}
            // 设置初始对话消息
            setMessages([
              {
                role: "assistant",
                content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？\n\n1. 🎯 迷宫游戏\n2. 🐹 打地鼠\n3. 🍎 接东西游戏\n4. 🏃 跑酷游戏\n\n你也可以在下面输入自己的想法！",
              },
            ]);
            rawMessagesRef.current = [{
              role: "assistant",
              content: "你好！我是小智老师 🤖✨\n\n你想创作什么类型的游戏呢？\n\n1. 🎯 迷宫游戏\n2. 🐹 打地鼠\n3. 🍎 接东西游戏\n4. 🏃 跑酷游戏\n\n你也可以在下面输入自己的想法！",
            }];
          }}
        />
      )}
      {reflectionPhase && !reflectionSubmitted && (
        <ReflectionPanel
          convId={currentConvId}
          onSave={async (data) => {
            setReflectionData(data);
            setReflectionSubmitted(true);
            setReflectionPhase(false);
            if (currentConvId) {
              try {
                const token = await getToken();
                if (!token) return;
                await fetch("/api/student/sessions", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ id: currentConvId, reflection: JSON.stringify(data) }),
                });
              } catch {}
            }
          }}
          onClose={() => setReflectionPhase(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// 反思弹窗组件（页面中央逐次出现三张卡片）
// ============================================================
function ReflectionPanel({
  onSave, onClose, convId,
}: {
  onSave: (data: Record<string, string>) => void;
  onClose: () => void;
  convId: string;
}) {
  const [step, setStep] = useState(0);
  const [card1, setCard1] = useState('');
  const [card2, setCard2] = useState('');
  const [card3, setCard3] = useState('');

  const steps = [
    { icon: '📷', title: '说说你的游戏', sub: '给你的游戏取个名字，再介绍一下它怎么玩～', value: card1, setValue: setCard1, placeholder: '比如：我的游戏叫接星星大作战，天上会飘下来很多星星，要用篮子接住，接一个加10分！' },
    { icon: '⭐', title: '你最得意的设计', sub: '你做游戏的时候，自己决定了哪个地方？为什么这样决定？', value: card2, setValue: setCard2, placeholder: '比如：我决定让星星飘来飘去，因为直直掉下来太简单了，飘来飘去更好玩' },
    { icon: '🚀', title: '下次你想加什么', sub: '如果下次还做这个游戏，你最想加什么新东西？', value: card3, setValue: setCard3, placeholder: '比如：我想加一个炸弹，碰到星星就会爆炸，这样玩起来更刺激' },
  ];

  const current = steps[step];
  const canNext = current.value.trim().length > 0;

  const handleNext = () => {
    if (step < 2) { setStep(step + 1); }
    else { onSave({ card1: card1.trim(), card2: card2.trim(), card3: card3.trim() }); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 px-6 pt-5 pb-1">
          {steps.map((_, i) => <div key={i} className={`flex-1 h-1.5 rounded-full transition ${i <= step ? 'bg-amber-400' : 'bg-gray-200'}`} />)}
        </div>
        <div className="text-center text-xs text-gray-400 mt-2 mb-4">第 {step + 1} / 3 步</div>
        <div className="px-6 pb-3">
          <p className="text-lg font-bold text-gray-800 mb-1">{current.icon} {current.title}</p>
          <p className="text-sm text-gray-500 mb-4">{current.sub}</p>
          <textarea
            value={current.value}
            onChange={(e) => current.setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canNext) { e.preventDefault(); handleNext(); } }}
            placeholder={current.placeholder}
            className="w-full p-3 text-base border border-gray-300 rounded-xl resize-none h-32 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none leading-relaxed"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <div />
          <div className="flex items-center gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">上一步</button>}
            <button onClick={handleNext} disabled={!canNext} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-medium transition">
              {step < 2 ? '下一步 →' : '✅ 完成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
