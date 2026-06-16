"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";
import DrawingTool from "@/components/DrawingTool";

// 三节课任务定义
const SESSIONS = [
  {
    id: 1,
    title: "第1节：个人设计 + 小组讨论",
    icon: " ",
    steps: [
      { id: "1-1", title: "个人设计", icon: "✏️", desc: "想一想你想做什么游戏，画出设计图，写下规则" },
      { id: "1-2", title: "小组讨论", icon: " ", desc: "轮流展示设计图，介绍自己的游戏，听取同学建议" },
    ],
  },
  {
    id: 2,
    title: "第2节：AI协作生成游戏",
    icon: " ",
    steps: [
      { id: "2-1", title: "AI协作", icon: " ", desc: "告诉小智老师你的游戏设计，让它帮你生成游戏" },
      { id: "2-2", title: "修改迭代", icon: " ", desc: "不断修改完善游戏，记录每次修改" },
    ],
  },
  {
    id: 3,
    title: "第3节：作品展示 + 同伴互评",
    icon: " ",
    steps: [
      { id: "3-1", title: "作品展示", icon: " ", desc: "上传你的作品，展示给其他同学" },
      { id: "3-2", title: "同伴互评", icon: "⭐", desc: "浏览其他同学的作品，互相评价" },
    ],
  },
];

interface GroupMessage {
  id: number;
  group_id: string;
  user_id: string;
  content: string;
  message_type: string;
  voice_transcript?: string;
  created_at: string;
  sender?: { id: string; name: string; student_id: string };
}

export default function TasksPage() {
  const router = useRouter();
  const [currentStepId, setCurrentStepId] = useState("1-1");
  const [rules, setRules] = useState(["", "", ""]);
  const [gameName, setGameName] = useState("");
  const [designReason, setDesignReason] = useState("");
  const [discussionNotes, setDiscussionNotes] = useState("");
  const [savedImage, setSavedImage] = useState<string | null>(null);

  // 小组聊天状态
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [myGroupId, setMyGroupId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // 找到当前步骤
  const currentSession = SESSIONS.find((s) => s.steps.some((st) => st.id === currentStepId))!;
  const currentStep = currentSession.steps.find((s) => s.id === currentStepId)!;

  // 加载小组消息
  useEffect(() => {
    const fetchGroupMessages = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/student/group-messages", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const msgs = await res.json();
          setGroupMessages(msgs);
          if (msgs.length > 0) setMyGroupId(msgs[0].group_id);
        }
      } catch (err) { console.error(err); }
    };
    fetchGroupMessages();
    // 每5秒刷新一次
    const interval = setInterval(fetchGroupMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [groupMessages]);

  // 保存设计图
  const handleSaveDrawing = async (data: { png: string; duration: number; saveCount: number; undoCount: number }) => {
    setSavedImage(data.png);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch("/api/student/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          task_id: "1-1",
          design_image: data.png,
          duration_seconds: data.duration,
          save_count: data.saveCount,
          undo_count: data.undoCount,
        }),
      });
    } catch (err) { console.error(err); }
  };

  // 保存任务数据
  const saveTaskData = async (taskId: string, data: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch("/api/student/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task_id: taskId, ...data }),
      });
      alert("保存成功！");
    } catch { alert("保存失败"); }
  };

  // 发送小组消息
  const sendMessage = async () => {
    if (!chatInput.trim() || !myGroupId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/student/group-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          group_id: myGroupId,
          content: chatInput.trim(),
          message_type: "text",
        }),
      });
      if (res.ok) {
        const newMsg = await res.json();
        setGroupMessages((prev) => [...prev, newMsg]);
        setChatInput("");
      }
    } catch (err) { console.error(err); }
  };

  // 语音输入
  const startVoiceInput = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("浏览器不支持语音输入");
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setChatInput(finalTranscript || interim);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (finalTranscript && myGroupId) {
        // 自动发送语音消息
        sendVoiceMessage(finalTranscript);
      }
    };

    recognition.onerror = () => setIsRecording(false);

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  // 发送语音消息
  const sendVoiceMessage = async (transcript: string) => {
    if (!myGroupId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/student/group-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          group_id: myGroupId,
          content: transcript,
          message_type: "voice",
          voice_transcript: transcript,
        }),
      });
      if (res.ok) {
        const newMsg = await res.json();
        setGroupMessages((prev) => [...prev, newMsg]);
        setChatInput("");
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 顶栏 */}
      <div className="fixed top-0 left-0 right-0 bg-indigo-600 text-white px-4 py-3 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/student")} className="text-white hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition text-sm">
            ← 返回
          </button>
          <h1 className="text-lg font-bold">  任务中心</h1>
        </div>
      </div>

      {/* 左侧任务栏 */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 mt-14 overflow-y-auto">
        {SESSIONS.map((session) => (
          <div key={session.id}>
            <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-700">{session.icon} {session.title}</span>
            </div>
            {session.steps.map((step) => (
              <button
                key={step.id}
                onClick={() => setCurrentStepId(step.id)}
                className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition border-b border-gray-50 ${
                  currentStepId === step.id
                    ? "bg-indigo-50 text-indigo-700 font-medium border-l-4 border-l-indigo-500"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>{step.icon}</span>
                <span>{step.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 mt-14 overflow-y-auto p-6">
        {/* 标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{currentStep.icon}</span>
            <h2 className="text-xl font-bold text-gray-800">{currentStep.title}</h2>
          </div>
          <p className="text-gray-600 ml-12">{currentStep.desc}</p>
        </div>

        {/* ========== 1-1 个人设计 ========== */}
        {currentStepId === "1-1" && (
          <div className="space-y-6">
            {/* 画设计图 */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">  画设计图</h3>
              <DrawingTool onSave={handleSaveDrawing} />
            </div>

            {/* 写游戏规则 */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">  写游戏规则</h3>
              <p className="text-sm text-gray-500 mb-4">用"如果……就……"把规则写下来：</p>
              <div className="space-y-3">
                {rules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500 w-16">规则{i + 1}：</span>
                    <span className="text-sm text-gray-400">如果</span>
                    <input
                      value={rule}
                      onChange={(e) => {
                        const newRules = [...rules];
                        newRules[i] = e.target.value;
                        setRules(newRules);
                      }}
                      placeholder="____________"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                    <span className="text-sm text-gray-400">，就____________</span>
                  </div>
                ))}
                <button onClick={() => setRules([...rules, ""])} className="text-sm text-indigo-500 hover:text-indigo-700">+ 添加更多规则</button>
              </div>
            </div>

            {/* 给游戏取名字 */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">  给游戏取名字</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">我的游戏叫：</label>
                  <input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="给游戏取个酷炫的名字！" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">我最得意的设计决定是：</label>
                  <textarea value={designReason} onChange={(e) => setDesignReason(e.target.value)} placeholder="说说你为什么这样设计～" rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none" />
                </div>
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="flex justify-end">
              <button onClick={() => saveTaskData("1-1", { game_rules: rules.filter(r => r.trim()), game_name: gameName, design_reason: designReason })} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">  保存所有内容</button>
            </div>
          </div>
        )}

        {/* ========== 1-2 小组讨论 ========== */}
        {currentStepId === "1-2" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">  小组讨论</h3>
              <div className="flex gap-6">
                {/* 左侧：当前展示者的设计 */}
                <div className="flex-1 border-r border-gray-200 pr-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">当前展示</h4>
                  {savedImage ? (
                    <div>
                      <img src={savedImage} alt="设计图" className="w-full max-w-[350px] border border-gray-200 rounded-lg mb-3" />
                      {gameName && <p className="text-sm font-medium">游戏名：{gameName}</p>}
                      {rules.filter(r => r.trim()).map((rule, i) => (
                        <p key={i} className="text-xs text-gray-600">规则{i + 1}：如果{rule}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 min-h-[300px] flex items-center justify-center">
                      <div className="text-center text-gray-400">
                        <p className="text-4xl mb-2"> </p>
                        <p className="text-sm">请先完成「个人设计」</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧：小组聊天 */}
                <div className="w-80 flex flex-col">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">小组聊天</h4>
                  <div className="flex-1 bg-gray-50 rounded-xl p-4 flex flex-col min-h-[400px]">
                    <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                      {groupMessages.length === 0 ? (
                        <p className="text-center text-gray-400 text-xs py-8">暂无消息</p>
                      ) : (
                        groupMessages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.sender?.id === msg.user_id ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${msg.sender?.id === msg.user_id ? "bg-indigo-500 text-white" : "bg-white text-gray-700 shadow-sm"}`}>
                              {msg.sender?.id !== msg.user_id && <p className="font-medium text-indigo-600 mb-1">{msg.sender?.name}</p>}
                              {msg.message_type === "voice" ? (
                                <div>
                                  <p className="text-amber-500 mb-1">🎤 语音消息</p>
                                  <p>{msg.voice_transcript || msg.content}</p>
                                </div>
                              ) : (
                                <p>{msg.content}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="输入消息..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:border-indigo-400 outline-none"
                      />
                      <button onClick={sendMessage} className="px-3 py-2 bg-indigo-500 text-white rounded-lg text-xs">发送</button>
                      <button
                        onClick={isRecording ? stopVoiceInput : startVoiceInput}
                        className={`px-3 py-2 rounded-lg text-xs ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-gray-200 text-gray-700"}`}
                      >{isRecording ? "⏹" : "🎤"}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 讨论记录 */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">  讨论记录</h3>
              <textarea
                value={discussionNotes}
                onChange={(e) => setDiscussionNotes(e.target.value)}
                placeholder="记录从同学那里学到的好想法..."
                rows={5}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
              />
              <div className="mt-3 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium">  讨论提示：</p>
                <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                  <li>• "你觉得他/她的游戏里，最有趣的设计是什么？"</li>
                  <li>• "如果让你来玩这个游戏，你会想加什么？"</li>
                  <li>• "你们几个人的游戏有什么相似的地方？"</li>
                </ul>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => saveTaskData("1-2", { discussion_notes: discussionNotes })} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">  保存讨论记录</button>
              </div>
            </div>
          </div>
        )}

        {/* ========== 2-1 AI协作 ========== */}
        {currentStepId === "2-1" && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">  AI协作</h3>
            <p className="text-gray-600 mb-4">点击左侧「对话」，告诉小智老师你的游戏设计：</p>
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200 mb-4">
              <p className="text-sm text-indigo-800 font-medium">提示：</p>
              <ul className="text-sm text-indigo-700 mt-2 space-y-1">
                <li>• 先告诉AI游戏的名字和类型</li>
                <li>• 说清楚核心规则（如果...就...）</li>
                <li>• 试玩后告诉AI哪里需要修改</li>
                <li>• 每次只改一个地方</li>
              </ul>
            </div>
            <button onClick={() => router.push("/student")} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">前往对话 →</button>
          </div>
        )}

        {/* ========== 2-2 修改迭代 ========== */}
        {currentStepId === "2-2" && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">  修改迭代</h3>
            <p className="text-gray-600 mb-4">继续和小智老师对话，不断修改完善你的游戏：</p>
            <div className="space-y-4">
              {[1, 2, 3].map((round) => (
                <div key={round} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">第{round}轮修改</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">告诉AI改什么：</label>
                      <textarea placeholder="记录你要修改的内容..." rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">修改后的效果：</label>
                      <textarea placeholder="记录修改后的效果..." rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none resize-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== 3-1 作品展示 ========== */}
        {currentStepId === "3-1" && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">  作品展示</h3>
            <p className="text-gray-600 mb-4">把你的最终游戏上传到展示平台：</p>
            <button onClick={() => router.push("/student")} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">前往上传作品 →</button>
          </div>
        )}

        {/* ========== 3-2 同伴互评 ========== */}
        {currentStepId === "3-2" && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">⭐ 同伴互评</h3>
            <p className="text-gray-600 mb-4">浏览其他同学的作品，至少评价3个：</p>
            <button onClick={() => router.push("/student/reviews")} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">前往评价 →</button>
          </div>
        )}
      </div>
    </div>
  );
}
