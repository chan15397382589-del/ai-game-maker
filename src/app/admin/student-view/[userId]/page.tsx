"use client";

import { useState, useEffect, use } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";

const GRADES = [
  { value: 3, label: "三年级" },
  { value: 4, label: "四年级" },
  { value: 5, label: "五年级" },
  { value: 6, label: "六年级" },
];

interface StudentInfo {
  id: string;
  name: string;
  student_id: string;
  grade: number | null;
  class_num: number | null;
}

interface ConvData {
  id: string;
  title: string;
  html_code: string | null;
  message_count: number;
  has_game: boolean;
  created_at: string;
  updated_at: string;
}

interface GameSnapshot {
  id: number;
  conversation_id: string;
  html_code: string;
  created_at: string;
}

interface Message {
  id: number;
  user_id: string;
  role: string;
  content: string;
  session_id: string;
  created_at: string;
}

async function getAuthToken(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "";
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch { return ""; }
}

function extractHtmlCode(content: string): string | null {
  const match = content.match(/```html\s*([\s\S]*?)```/i);
  if (match) return match[1].trim();
  const genericMatch = content.match(/```\s*([\s\S]*?)```/);
  if (genericMatch && /<\w/.test(genericMatch[1])) return genericMatch[1].trim();
  return null;
}

export default function StudentViewPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [conversations, setConversations] = useState<ConvData[]>([]);
  const [snapshots, setSnapshots] = useState<GameSnapshot[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // 选中的对话和快照
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<GameSnapshot | null>(null);
  const [filteredMessages, setFilteredMessages] = useState<Message[]>([]);

  // 展开的对话分组（显示其游戏快照）
  const [expandedConv, setExpandedConv] = useState<string | null>(null);

  // 游戏预览
  const [previewCode, setPreviewCode] = useState<string | null>(null);

  // 按对话分组游戏快照（最新在前），用对话当前代码兜底
  const snapshotsByConv: Record<string, GameSnapshot[]> = {};
  for (const s of snapshots) {
    if (!snapshotsByConv[s.conversation_id]) snapshotsByConv[s.conversation_id] = [];
    snapshotsByConv[s.conversation_id].push(s);
  }
  // 对于没有快照但有游戏代码的对话，用当前代码显示"当前版本"
  for (const conv of conversations) {
    if (conv.html_code && (!snapshotsByConv[conv.id] || snapshotsByConv[conv.id].length === 0)) {
      snapshotsByConv[conv.id] = [{
        id: 0,
        conversation_id: conv.id,
        html_code: conv.html_code,
        created_at: conv.updated_at,
      }];
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      await fetchData();
    }).catch(() => router.push("/login"));
  }, []);

  const fetchData = async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/student-view/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStudent(data.student);
        setConversations(data.conversations || []);
        setSnapshots(data.snapshots || []);
        setMessages(data.messages || []);
      }
    } catch (err) { console.error("加载失败:", err); }
    finally { setLoading(false); }
  };

  const handleSelectConv = (convId: string) => {
    setSelectedConv(convId);
    setSelectedSnapshot(null);
    const filtered = messages.filter((m) => m.session_id === convId);
    setFilteredMessages(filtered);
  };

  const handleSelectSnapshot = (snap: GameSnapshot) => {
    setSelectedSnapshot(snap);
    setPreviewCode(snap.html_code);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500 text-lg">加载中...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500 text-lg">学生不存在</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-4 px-4 py-3 bg-indigo-600 text-white flex-shrink-0">
        <button onClick={() => router.push("/admin")}
          className="text-white hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition text-sm">
          ← 返回管理
        </button>
        <span className="text-2xl">👤</span>
        <div>
          <h1 className="text-lg font-bold">{student.name}</h1>
          <p className="text-xs text-indigo-200">
            学号: {student.student_id}
            {student.grade && ` · ${GRADES.find(g => g.value === student.grade)?.label || ""}`}
            {student.class_num && `${student.class_num}班`}
          </p>
        </div>
        <span className="ml-auto text-xs text-indigo-200">
          共 {conversations.length} 个对话 · {snapshots.length} 个游戏版本
        </span>
      </div>

      {/* 主体：三列布局 */}
      <div className="flex-1 min-h-0 flex gap-3 p-3">
        {/* 左侧面板：游戏版本（按对话分组） */}
        <div className="w-72 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-3 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">🎮 游戏版本 ({snapshots.length})</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">暂无对话</p>
            ) : (
              conversations.map((conv) => {
                const convSnaps = snapshotsByConv[conv.id] || [];
                const isExpanded = expandedConv === conv.id;
                const isSelected = selectedConv === conv.id;
                return (
                  <div key={conv.id} className="border-b border-gray-100">
                    {/* 对话标题行 */}
                    <div
                      onClick={() => {
                        handleSelectConv(conv.id);
                        setExpandedConv(isExpanded ? null : conv.id);
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition ${
                        isSelected ? "bg-indigo-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className={`text-xs transition ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                      <span className={`text-sm font-medium flex-1 truncate ${isSelected ? "text-indigo-700" : "text-gray-700"}`}>
                        📝 {conv.title}
                      </span>
                      <span className="text-xs text-gray-400">{convSnaps.length}版</span>
                    </div>

                    {/* 游戏版本列表 */}
                    {isExpanded && (
                      <div className="bg-gray-50 px-3 py-1.5 space-y-1">
                        {convSnaps.length === 0 ? (
                          <p className="text-xs text-gray-400 py-2 pl-5">暂无游戏版本</p>
                        ) : (
                          convSnaps.map((snap, idx) => {
                            const isSnapSelected = selectedSnapshot?.id === snap.id;
                            return (
                              <div
                                key={snap.id}
                                onClick={() => handleSelectSnapshot(snap)}
                                className={`flex items-center gap-2 pl-5 pr-2 py-2 rounded-lg cursor-pointer transition ${
                                  isSnapSelected ? "bg-amber-100 text-amber-700" : "hover:bg-gray-200 text-gray-600"
                                }`}
                              >
                                <span className="text-xs font-mono text-gray-400">
                                  {snap.id === 0 ? "当前" : `v${convSnaps.length - idx}`}
                                </span>
                                <span className="text-xs flex-1">
                                  {new Date(snap.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSelectSnapshot(snap); }}
                                  className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded transition"
                                >
                                  ▶
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 中间：消息回放 */}
        <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">
              {selectedConv
                ? `💬 ${conversations.find(c => c.id === selectedConv)?.title || "对话"} — ${filteredMessages.length} 条消息`
                : "💬 请在左侧选择对话"}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!selectedConv ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>← 点击左侧对话查看聊天记录</p>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>该对话暂无消息</p>
              </div>
            ) : (
              filteredMessages.map((msg, i) => {
                const hasCode = msg.role === "assistant" && extractHtmlCode(msg.content);
                const displayContent = msg.content
                  .replace(/```html[\s\S]*?```/g, " [游戏代码] ")
                  .replace(/```[\s\S]*?```/g, "")
                  .trim() || msg.content;
                return (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={msg.role === "user" ? "chat-bubble-user max-w-[70%]" : "chat-bubble-ai max-w-[70%]"}>
                      <p className="text-xs opacity-70 mb-1 font-medium flex items-center gap-2">
                        <span>{msg.role === "user" ? "👦 学生" : "🤖 小智老师"}</span>
                        <span className="opacity-50 text-[10px]">
                          {new Date(msg.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {hasCode && (
                          <button
                            onClick={() => {
                              const code = extractHtmlCode(msg.content);
                              if (code) setPreviewCode(code);
                            }}
                            className="ml-auto bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-medium transition"
                          >
                            &lt;/&gt; 查看代码
                          </button>
                        )}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{displayContent}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右侧：游戏预览 */}
        <div className="w-[40%] flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {previewCode ? "🎮 游戏预览" : "🎮 点击左侧预览游戏"}
            </h3>
            {previewCode && (
              <button onClick={() => setPreviewCode(null)}
                className="text-xs text-gray-400 hover:text-gray-600">关闭</button>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {previewCode ? (
              <iframe srcDoc={previewCode} className="w-full h-full" sandbox="allow-scripts" scrolling="no" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-4xl mb-2">🎮</p>
                  <p className="text-sm">选择对话中的代码或游戏版本来预览</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
