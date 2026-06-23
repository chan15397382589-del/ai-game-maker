"use client";

import { useState } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";
import { isRandomInput } from "@/utils/inputValidation";
import { trackEvent } from "@/utils/trackEvent";

interface Props {
  userId: string;
}

const REFLECTION_PROMPTS = [
  { id: "q1", icon: " ", title: "描述你的游戏", sentence: "我的游戏叫 {0}，玩法是 {1}。", blanks: 2, placeholder: ["游戏名称", "玩法说明"] },
  { id: "q2", icon: " ", title: "说明你的规则", sentence: "我的游戏有一条规则：如果 {0}，就 {1}。", blanks: 2, placeholder: ["条件", "结果"] },
  { id: "q3", icon: " ", title: "遇到的困难", sentence: "我遇到的困难是 {0}，我用 {1} 方法解决了。", blanks: 2, placeholder: ["困难", "解决方法"] },
  { id: "q4", icon: " ", title: "同伴的反馈", sentence: "同伴说我的游戏 {0}，我觉得 {1}。", blanks: 2, placeholder: ["同伴的评价", "你的想法"] },
  { id: "q5", icon: " ", title: "如果重新做", sentence: "如果再做一次，我会改 {0}。", blanks: 1, placeholder: ["你想改进的地方"] },
];

export default function ModuleReflection({ userId }: Props) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({
    q1: ["", ""], q2: ["", ""], q3: ["", ""], q4: ["", ""], q5: [""],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSave = REFLECTION_PROMPTS.every((p) =>
    (answers[p.id] || []).every((a) => a.trim().length >= 2)
  );

  const updateAnswer = (id: string, idx: number, value: string) => {
    setAnswers((prev) => {
      const arr = [...(prev[id] || [])];
      arr[idx] = value;
      return { ...prev, [id]: arr };
    });
  };

  const handleSave = async () => {
    if (!canSave) return;

    for (const p of REFLECTION_PROMPTS) {
      for (const a of answers[p.id] || []) {
        if (isRandomInput(a)) {
          alert("请认真填写反思内容，不要乱打键盘哦～");
          return;
        }
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
      if (!convs || convs.length === 0) {
        alert("请先创建一个对话再保存反思");
        setSaving(false);
        return;
      }

      const latestConvId = convs[0].id;
      const reflection: Record<string, string> = {};
      REFLECTION_PROMPTS.forEach((p) => {
        let sentence = p.sentence;
        (answers[p.id] || []).forEach((a, i) => {
          sentence = sentence.replace(`{${i}}`, a || "______");
        });
        reflection[p.id] = sentence;
      });

      const res = await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: latestConvId, reflection: JSON.stringify(reflection) }),
      });

      if (res.ok) {
        trackEvent("reflection_submit", latestConvId, {
          q1Length: reflection.q1.length,
          q2Length: reflection.q2.length,
          q3Length: reflection.q3.length,
          q4Length: reflection.q4.length,
          q5Length: reflection.q5.length,
        });
        setSaved(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("保存失败：" + (err.error || "请重试"));
      }
    } catch (e: any) {
      alert("保存异常：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center">
        <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6">
          <span className="text-5xl">✅</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">反思已保存！</h2>
        <p className="text-gray-500 mb-6">感谢你的认真思考，这对你的学习很有帮助！</p>
        <button onClick={() => window.location.href = "/student"} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">返回首页</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      {/* 标题 */}
      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
        <span className="text-3xl"> </span>
        <div>
          <h2 className="text-xl font-bold text-amber-800">我的反思</h2>
          <p className="text-sm text-amber-600">回顾你的创作过程，认真填写下面的句子</p>
        </div>
      </div>

      {/* 反思问题 */}
      {REFLECTION_PROMPTS.map((prompt, idx) => {
        // 将 sentence 拆分成文字和输入框交替的数组
        const parts: { type: "text" | "blank"; content: string; idx?: number }[] = [];
        const segments = prompt.sentence.split(/(\{\d+\})/);
        segments.forEach((seg) => {
          const blankMatch = seg.match(/^\{(\d+)\}$/);
          if (blankMatch) {
            parts.push({ type: "blank", content: "", idx: parseInt(blankMatch[1]) });
          } else if (seg) {
            parts.push({ type: "text", content: seg });
          }
        });

        return (
          <div key={prompt.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-2">
              <span className="text-lg">{prompt.icon}</span>
              <span className="text-sm font-bold text-white">{idx + 1}. {prompt.title}</span>
            </div>
            <div className="p-5">
              <div className="text-base text-gray-700 leading-relaxed">
                {parts.map((part, i) => {
                  if (part.type === "text") {
                    return <span key={i}>{part.content}</span>;
                  }
                  const blankIdx = part.idx!;
                  return (
                    <span key={i} className="inline-flex items-center mx-0.5">
                      <input
                        type="text"
                        value={answers[prompt.id]?.[blankIdx] || ""}
                        onChange={(e) => updateAnswer(prompt.id, blankIdx, e.target.value)}
                        placeholder={prompt.placeholder[blankIdx]}
                        className="inline-block w-28 px-1 py-0 bg-transparent border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-base text-gray-800 placeholder-gray-300 transition"
                        style={{ width: `${Math.max(100, (answers[prompt.id]?.[blankIdx] || prompt.placeholder[blankIdx]).length * 17)}px` }}
                      />
                      <VoiceButton onResult={(text) => updateAnswer(prompt.id, blankIdx, (answers[prompt.id]?.[blankIdx] || "") + text)} />
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* 保存按钮 */}
      <div className="flex justify-center pt-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-10 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white rounded-xl text-base font-bold transition shadow-lg"
        >
          {saving ? "保存中..." : "提交反思 ✅"}
        </button>
      </div>
    </div>
  );
}
