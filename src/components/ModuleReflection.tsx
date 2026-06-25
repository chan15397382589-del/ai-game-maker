"use client";

import { useState } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";
import { isRandomInput } from "@/utils/inputValidation";
import { trackEvent } from "@/utils/trackEvent";

interface Props {
  userId: string;
}

// 反思问题：填空 + 选择
const REFLECTIONS = [
  {
    id: "q1", icon: " ", title: "描述你的游戏",
    fillParts: ["我的游戏叫 ", "，玩法是 ", "。"],
    fillKeys: ["name", "play"],
    fillPlaceholders: ["游戏名称", "怎么玩的"],
    choices: [] as string[],
  },
  {
    id: "q2", icon: " ", title: "说明你的规则",
    fillParts: ["如果 ", "，就 ", "。"],
    fillKeys: ["condition", "result"],
    fillPlaceholders: ["什么情况", "发生什么"],
    choices: [] as string[],
  },
  {
    id: "q3", icon: " ", title: "遇到的困难",
    fillParts: [""],
    fillKeys: ["solve"],
    fillPlaceholders: ["我怎么解决的"],
    choices: ["代码太复杂", "规则想不清楚", "画面不好看", "不知道怎么改", "太难实现想法", "时间不够"],
    choiceLabel: "我遇到的困难是：",
    choiceKey: "difficulty",
  },
  {
    id: "q4", icon: " ", title: "同伴的反馈",
    fillParts: [""],
    fillKeys: ["feel"],
    fillPlaceholders: ["我的想法"],
    choices: ["很好玩不需要改", "画面做得很漂亮", "还需要继续改进", "同学没看懂我的游戏", "同学给了我很好的建议"],
    choiceLabel: "同伴给我的反馈：",
    choiceKey: "feedback",
  },
  {
    id: "q5", icon: " ", title: "如果重新做",
    fillParts: [""],
    fillKeys: ["redo"],
    fillPlaceholders: ["我想怎么改"],
    choices: ["修改游戏规则", "改画面更好看", "加更多关卡", "加音乐音效", "调整游戏难度", "换一个游戏类型"],
    choiceLabel: "如果再做一次：",
    choiceKey: "redoType",
  },
];

export default function ModuleReflection({ userId }: Props) {
  const [fills, setFills] = useState<Record<string, string[]>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateFill = (qId: string, idx: number, val: string) => {
    setFills((prev) => {
      const arr = [...(prev[qId] || [])];
      arr[idx] = val;
      return { ...prev, [qId]: arr };
    });
  };
  const updateChoice = (qId: string, val: string) => {
    setChoices((prev) => ({ ...prev, [qId]: val }));
  };

  const canSave = REFLECTIONS.every((r) => {
    const hasChoices = r.choices.length === 0 || (choices[r.id] || "").trim().length > 0;
    const hasFills = r.fillParts.length <= 1 || (fills[r.id] || []).every((f: string) => f.trim().length >= 1);
    return hasChoices && hasFills;
  });

  const handleSave = async () => {
    if (!canSave) return;
    for (const r of REFLECTIONS) {
      for (const f of fills[r.id] || []) {
        if (isRandomInput(f)) { alert("请认真填写反思内容"); return; }
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
      const latestConvId = convs[0].id;
      const data: Record<string, any> = {};
      REFLECTIONS.forEach((r) => {
        data[r.id] = { fills: fills[r.id] || [], choice: choices[r.id] || "" };
      });
      const res = await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: latestConvId, reflection: JSON.stringify(data) }),
      });
      if (res.ok) {
        trackEvent("reflection_submit", latestConvId);
        setSaved(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("保存失败：" + (err.error || "请重试"));
      }
    } catch (e: any) { alert("保存异常：" + e.message); }
    finally { setSaving(false); }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center">
        <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6"><span className="text-5xl">✅</span></div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">反思已保存！</h2>
        <p className="text-gray-500 mb-6">感谢你的认真思考！</p>
        <button onClick={() => window.location.href = "/student"} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">返回首页</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
        <span className="text-3xl"> </span>
        <div><h2 className="text-xl font-bold text-amber-800">我的反思</h2><p className="text-sm text-amber-600">回顾你的创作过程，填空+选择</p></div>
      </div>

      {REFLECTIONS.map((r, idx) => (
        <div key={r.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-2">
            <span className="text-lg">{r.icon}</span>
            <span className="text-sm font-bold text-white">{idx + 1}. {r.title}</span>
          </div>
          <div className="p-5 space-y-3">
            {/* 填空题 */}
            <div className="text-base text-gray-700 leading-9">
              {r.fillParts.map((part, i) => (
                <span key={i}>
                  <span>{part}</span>
                  {i < r.fillKeys.length && (
                    <span className="inline-flex items-center mx-0.5">
                      <input
                        type="text"
                        value={(fills[r.id] || [])[i] || ""}
                        onChange={(e) => updateFill(r.id, i, e.target.value)}
                        placeholder={r.fillPlaceholders[i] || ""}
                        className="inline-block px-1 py-0 bg-transparent border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-base text-gray-800 placeholder-gray-300"
                        style={{ minWidth: "180px", width: `${Math.max(180, ((fills[r.id] || [])[i] || r.fillPlaceholders[i] || "").length * 18)}px` }}
                      />
                      <VoiceButton onResult={(text) => updateFill(r.id, i, ((fills[r.id] || [])[i] || "") + text)} />
                    </span>
                  )}
                </span>
              ))}
            </div>
            {/* 选择题 */}
            {r.choices.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">{r.choiceLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.choices.map((opt) => (
                    <button key={opt} onClick={() => updateChoice(r.id, opt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${choices[r.id] === opt ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >{opt}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <input value={choices[r.id] && !r.choices.includes(choices[r.id]) ? choices[r.id] : ""}
                    onChange={(e) => updateChoice(r.id, e.target.value)} placeholder="其他：自己写..."
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400" />
                  <VoiceButton onResult={(text) => updateChoice(r.id, (choices[r.id] || "") + text)} />
                </div>
              </div>
            )}
            {/* 填空输入 */}
            {r.fillParts.length <= 1 && (
              <div className="flex gap-1.5">
                <input value={(fills[r.id] || [])[0] || ""}
                  onChange={(e) => updateFill(r.id, 0, e.target.value)}
                  placeholder={r.fillPlaceholders[0] || "填写..."}
                  className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
                <VoiceButton onResult={(text) => updateFill(r.id, 0, ((fills[r.id] || [])[0] || "") + text)} />
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="flex justify-center pt-2">
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-10 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white rounded-xl text-base font-bold transition shadow-lg"
        >{saving ? "保存中..." : "提交反思 ✅"}</button>
      </div>
    </div>
  );
}
