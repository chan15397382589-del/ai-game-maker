"use client";

import { useState } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";
import { isRandomInput } from "@/utils/inputValidation";

interface Props {
  userId: string;
}

export default function ModuleReflection({ userId }: Props) {
  const [card1, setCard1] = useState("");
  const [card2, setCard2] = useState("");
  const [card3, setCard3] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSave = card1.trim().length >= 10 && card2.trim().length >= 10 && card3.trim().length >= 10;

  const handleSave = async () => {
    if (!canSave) return;
    // 输入验证
    if (isRandomInput(card1) || isRandomInput(card2) || isRandomInput(card3)) {
      alert("请认真填写反思内容，不要乱打键盘哦～");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: "reflection",
          reflection: JSON.stringify({ card1: card1.trim(), card2: card2.trim(), card3: card3.trim() }),
        }),
      });
      if (res.ok) {
        setSaved(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("保存失败：" + (err.error || "请重试"));
      }
    } catch (e: any) {
      alert("保存异常：" + e.message);
    } finally { setSaving(false); }
  };

  if (saved) {
    return (
      <div className="text-center py-20">
        <p className="text-6xl mb-4">✅</p>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">反思已保存！</h2>
        <p className="text-gray-500">感谢你的认真思考，这对你的学习很有帮助！</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-800">  我的反思</h2>
      <p className="text-gray-600">回顾你的创作过程，认真回答下面三个问题：</p>

      {/* 卡片1 */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl"> </span>
          <div>
            <h3 className="text-lg font-bold text-gray-800">说说你的游戏</h3>
            <p className="text-sm text-gray-500">给你的游戏取个名字，再介绍一下它怎么玩～</p>
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            value={card1}
            onChange={(e) => setCard1(e.target.value)}
            placeholder="比如：我的游戏叫接星星大作战，天上会飘下来很多星星，要用篮子接住，接一个加10分！"
            rows={4}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
          />
          <VoiceButton onResult={(text) => setCard1((prev) => prev + text)} size="lg" />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{card1.length} / 10字</p>
      </div>

      {/* 卡片2 */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">⭐</span>
          <div>
            <h3 className="text-lg font-bold text-gray-800">你最得意的设计</h3>
            <p className="text-sm text-gray-500">你做游戏的时候，自己决定了哪个地方？为什么这样决定？</p>
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            value={card2}
            onChange={(e) => setCard2(e.target.value)}
            placeholder="比如：我决定让星星飘来飘去，因为直直掉下来太简单了，飘来飘去更好玩"
            rows={4}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
          />
          <VoiceButton onResult={(text) => setCard2((prev) => prev + text)} size="lg" />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{card2.length} / 10字</p>
      </div>

      {/* 卡片3 */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl"> </span>
          <div>
            <h3 className="text-lg font-bold text-gray-800">下次你想加什么</h3>
            <p className="text-sm text-gray-500">如果下次还做这个游戏，你最想加什么新东西？</p>
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            value={card3}
            onChange={(e) => setCard3(e.target.value)}
            placeholder="比如：我想加一个炸弹，碰到星星就会爆炸，这样玩起来更刺激"
            rows={4}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
          />
          <VoiceButton onResult={(text) => setCard3((prev) => prev + text)} size="lg" />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{card3.length} / 10字</p>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-8 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-medium transition"
        >
          {saving ? "保存中..." : "提交反思"}
        </button>
      </div>
    </div>
  );
}
