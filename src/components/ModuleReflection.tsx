"use client";

import { useState } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";
import { isRandomInput } from "@/utils/inputValidation";
import { trackEvent } from "@/utils/trackEvent";

interface Props {
  userId: string;
}

const REFLECTIONS = [
  {
    id: "q1", icon: " ", title: "描述你的游戏",
    text: "我的游戏叫 {name}，玩法是 {play}。",
    keys: ["name", "play"],
    placeholders: ["游戏名称", "怎么玩的"],
    choices: [] as string[],
  },
  {
    id: "q2", icon: " ", title: "说明你的规则",
    text: "如果 {cond}，就 {result}。",
    keys: ["cond", "result"],
    placeholders: ["什么情况", "发生什么"],
    choices: [] as string[],
  },
  {
    id: "q3", icon: " ", title: "遇到的困难",
    text: "我遇到的困难是 {difficulty}，我用 {solve} 方法解决了。",
    keys: ["difficulty", "solve"],
    placeholders: ["什么困难", "怎么解决"],
    choices: ["代码太复杂写不出来","规则想不清楚","画面不好看不知道怎么画","不知道怎么改更好","AI不理解我的意思","时间不够没做完","想做的太多做不完","不知道怎么添加音效"],
  },
  {
    id: "q4", icon: " ", title: "同伴的反馈",
    text: "同伴说我的游戏 {feedback}，我觉得 {feel}。",
    keys: ["feedback", "feel"],
    placeholders: ["同伴的评价", "我的想法"],
    choices: ["很好玩不需要改","画面做得很漂亮可以更好","还需要继续改进","同学没看懂我的游戏","同学给了我很好的建议","同学发现了bug让我改","同学喜欢我的规则设计"],
  },
  {
    id: "q5", icon: " ", title: "如果重新做",
    text: "如果再做一次，我会改 {redo}。",
    keys: ["redo"],
    placeholders: ["我想怎么改"],
    choices: ["修改游戏规则","把画面做得更好看","加更多关卡","加音乐和音效","调整游戏难度","换一个游戏类型","让操作更流畅","加更多的道具或角色","做一个完全不同的游戏"],
  },
];

export default function ModuleReflection({ userId }: Props) {
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);

  // AI 自动生成反思
  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/student/generate-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reflection) {
          const newAnswers: Record<string, Record<string, string>> = {};
          Object.entries(data.reflection).forEach(([qId, vals]: [string, any]) => {
            newAnswers[qId] = vals;
          });
          setAnswers(newAnswers);
          alert("✅ AI 已根据你的对话生成反思，你可以修改后提交！");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert("生成失败：" + (err.error || "请重试"));
      }
    } catch (err: any) { alert("生成失败：" + err.message); }
    finally { setGenerating(false); }
  };

  const updateAns = (qId: string, key: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...(prev[qId] || {}), [key]: val } }));
  };

  const canSave = REFLECTIONS.every((r) =>
    r.keys.every((k) => ((answers[r.id] || {})[k] || "").trim().length >= 1)
  );

  const handleSave = async () => {
    if (!canSave) return;
    for (const r of REFLECTIONS) {
      for (const k of r.keys) {
        if (isRandomInput((answers[r.id] || {})[k] || "")) { alert("请认真填写反思内容"); return; }
      }
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const convsRes = await fetch("/api/student/sessions", { headers: { Authorization: `Bearer ${token}` } });
      if (!convsRes.ok) throw new Error("获取对话列表失败");
      const convs = await convsRes.json();
      if (!convs?.length) { alert("请先创建对话"); setSaving(false); return; }
      const res = await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: convs[0].id, reflection: JSON.stringify(answers) }),
      });
      if (res.ok) { trackEvent("reflection_submit", convs[0].id); setSaved(true); }
      else { const err = await res.json().catch(() => ({})); alert("保存失败：" + (err.error || "请重试")); }
    } catch (e: any) { alert("保存异常：" + e.message); }
    finally { setSaving(false); }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center">
        <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6"><span className="text-5xl">✅</span></div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">反思已保存！</h2>
        <button onClick={() => window.location.href = "/student"} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">返回首页</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
        <span className="text-3xl"> </span>
        <div><h2 className="text-xl font-bold text-amber-800">我的反思</h2><p className="text-sm text-amber-600">回顾你的创作过程</p></div>
      </div>

      {REFLECTIONS.map((r, idx) => {
        // 构建填空文本
        const parts = r.text.split(/(\{\w+\})/);
        return (
          <div key={r.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-2">
              <span className="text-lg">{r.icon}</span>
              <span className="text-sm font-bold text-white">{idx + 1}. {r.title}</span>
            </div>
            <div className="p-5 space-y-3">
              {/* 填空句子 */}
              <div className="text-sm text-gray-700 leading-9">
                {parts.map((part, i) => {
                  const m = part.match(/^\{(\w+)\}$/);
                  if (m) {
                    const key = m[1];
                    const val = ((answers[r.id] || {})[key] || "");
                    return (
                      <span key={i} className="inline-flex items-center mx-0.5">
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => updateAns(r.id, key, e.target.value)}
                          placeholder="________"
                          className="inline-block px-1 py-0 bg-transparent border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm text-gray-800 placeholder-gray-300"
                          style={{ minWidth: "140px", width: `${Math.max(140, (val || "________").length * 16)}px` }}
                        />
                        <VoiceButton onResult={(text) => updateAns(r.id, key, val + text)} />
                      </span>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
              </div>
              {/* 选项按钮（填入第一个填空） */}
              {r.choices.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.choices.map((opt) => (
                    <button key={opt} onClick={() => updateAns(r.id, r.keys[0], opt)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 transition"
                    >{opt}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-center pt-2">
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-10 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white rounded-xl text-base font-bold transition shadow-lg"
        >{saving ? "保存中..." : "提交反思 ✅"}</button>
      </div>
    </div>
  );
}
