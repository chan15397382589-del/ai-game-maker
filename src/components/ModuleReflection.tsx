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
  { id: "q1", icon: " ", title: "描述你的游戏", template: "我的游戏叫______，玩法是______。", placeholder: "比如：我的游戏叫太空大战，玩法是控制飞船消灭敌人" },
  { id: "q2", icon: " ", title: "说明你的规则", template: "我的游戏有一条规则：如果______，就______。", placeholder: "比如：如果子弹打中敌人，就得一分" },
  { id: "q3", icon: " ", title: "遇到的困难", template: "我遇到的困难是______，我用______方法解决了。", placeholder: "比如：我遇到的困难是球穿墙了，我用反弹代码解决了" },
  { id: "q4", icon: " ", title: "同伴的反馈", template: "同伴说我的游戏______，我觉得______。", placeholder: "比如：同伴说我的游戏很好玩，我觉得他说得对" },
  { id: "q5", icon: " ", title: "如果重新做", template: "如果再做一次，我会改______。", placeholder: "比如：我会改规则，让难度慢慢变大" },
];

export default function ModuleReflection({ userId }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({
    q1: "", q2: "", q3: "", q4: "", q5: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSave = REFLECTION_PROMPTS.every((p) => (answers[p.id] || "").trim().length >= 5);

  const updateAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    if (!canSave) return;

    // 输入验证
    for (const p of REFLECTION_PROMPTS) {
      if (isRandomInput(answers[p.id] || "")) {
        alert("请认真填写反思内容，不要乱打键盘哦～");
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // 获取最新对话
      const convsRes = await fetch("/api/student/sessions", { headers: { Authorization: `Bearer ${token}` } });
      if (!convsRes.ok) throw new Error("获取对话列表失败");
      const convs = await convsRes.json();
      if (!convs || convs.length === 0) {
        alert("请先创建一个对话再保存反思");
        setSaving(false);
        return;
      }

      const latestConvId = convs[0].id;
      const trimmedAnswers: Record<string, string> = {};
      REFLECTION_PROMPTS.forEach((p) => { trimmedAnswers[p.id] = (answers[p.id] || "").trim(); });

      const res = await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: latestConvId,
          reflection: JSON.stringify(trimmedAnswers),
        }),
      });

      if (res.ok) {
        trackEvent("reflection_submit", latestConvId, {
          q1Length: trimmedAnswers.q1.length,
          q2Length: trimmedAnswers.q2.length,
          q3Length: trimmedAnswers.q3.length,
          q4Length: trimmedAnswers.q4.length,
          q5Length: trimmedAnswers.q5.length,
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
          <p className="text-sm text-amber-600">回顾你的创作过程，认真回答下面五个问题</p>
        </div>
      </div>

      {/* 反思问题 */}
      {REFLECTION_PROMPTS.map((prompt, idx) => (
        <div key={prompt.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          {/* 标题栏 */}
          <div className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-2">
            <span className="text-lg">{prompt.icon}</span>
            <span className="text-sm font-bold text-white">{idx + 1}. {prompt.title}</span>
          </div>
          {/* 内容区 */}
          <div className="p-5">
            {/* 句式模板提示 */}
            <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">参考句式：</p>
              <p className="text-sm text-gray-700 font-medium">{prompt.template}</p>
            </div>
            {/* 输入框 */}
            <div className="flex gap-2">
              <textarea
                value={answers[prompt.id] || ""}
                onChange={(e) => updateAnswer(prompt.id, e.target.value)}
                placeholder={prompt.placeholder}
                rows={3}
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition"
              />
              <VoiceButton onResult={(text) => updateAnswer(prompt.id, (answers[prompt.id] || "") + text)} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-right">{(answers[prompt.id] || "").length} / 5字</p>
          </div>
        </div>
      ))}

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
