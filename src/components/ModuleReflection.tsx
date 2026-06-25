"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";

interface Props {
  userId: string;
}

// 选项库
const CHOICES = {
  difficulty: ["代码太复杂写不出来", "规则想不清楚", "画面不好看不知道怎么画", "不知道怎么改更好", "AI不理解我的意思", "时间不够没做完", "想做的太多做不完", "不知道怎么添加音效", "游戏跑不起来", "没有遇到困难"],
  solve: ["问AI老师帮忙", "自己多试了几次", "看了同学的游戏", "简化了规则", "查了资料", "重新想了一个办法"],
  feedback: ["很好玩不需要改", "画面做得漂亮", "还需要继续改进", "同学没看懂我的游戏", "同学给了我很好的建议", "同学发现了bug让我改", "同学喜欢我的规则"],
  feel: ["很开心有人喜欢", "觉得还有进步空间", "想马上改好", "有点失望但没关系", "学到了新东西", "下次要做更好"],
  redo: ["修改游戏规则", "把画面做得更好看", "加更多关卡", "加音乐和音效", "调整游戏难度", "换一个游戏类型", "让操作更流畅", "加更多的道具或角色", "做一个完全不同的游戏"],
};

export default function ModuleReflection({ userId }: Props) {
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const [convsRes, tasksRes] = await Promise.all([
          fetch("/api/student/sessions", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/student/tasks?task_id=1-1", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        // 已有反思则不覆盖
        if (convsRes.ok) {
          const convs = await convsRes.json();
          if (convs?.length && convs[0].reflection) {
            try {
              const parsed = JSON.parse(convs[0].reflection);
              if (Object.keys(parsed).length > 0) {
                setAnswers(parsed);
                setSaved(true);
                setLoaded(true);
                return;
              }
            } catch {}
          }
        }

        // 从游戏设计填充
        if (tasksRes.ok) {
          const tasks = await tasksRes.json();
          if (tasks.length > 0) {
            const task = tasks[0];
            const rules = task.game_rules || [];
            let aiPrompt = "";
            try { aiPrompt = JSON.parse(task.design_reason || "{}").ai_prompt || ""; } catch {}
            setAnswers({
              q1: { name: task.game_name || "", play: aiPrompt || "" },
              q2: { cond: rules[0] || "", result: rules[1] || "" },
              q3: { difficulty: "", solve: "" },
              q4: { feedback: "", feel: "" },
              q5: { redo: "" },
            });
          }
        }
        setLoaded(true);
      } catch (err) { console.error(err); setLoaded(true); }
    })();
  }, []);

  const setAns = (qId: string, key: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...(prev[qId] || {}), [key]: val } }));
  };

  const canSave = Object.keys(answers).length >= 5;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const convsRes = await fetch("/api/student/sessions", { headers: { Authorization: `Bearer ${token}` } });
      const convs = await convsRes.json();
      if (!convs?.length) { alert("请先创建对话"); setSaving(false); return; }
      await fetch("/api/student/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: convs[0].id, reflection: JSON.stringify(answers) }),
      });
      setSaved(true);
    } catch (e: any) { alert("保存失败"); }
    finally { setSaving(false); }
  };

  if (!loaded) {
    return <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div></div>;
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center">
        <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6"><span className="text-5xl">✅</span></div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">反思已保存！</h2>
        <button onClick={() => { setSaved(false); }} className="px-4 py-2 text-indigo-500 text-sm">修改</button>
        <button onClick={() => window.location.href = "/student"} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition mt-2">返回首页</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
        <span className="text-3xl"> </span>
        <div><h2 className="text-xl font-bold text-amber-800">我的反思</h2><p className="text-sm text-amber-600">已经根据你的游戏设计填好了，可以修改</p></div>
      </div>

      {/* 所有反思在一个卡片内 */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="p-5 space-y-6">
          {/* Q1 */}
          <div>
            <p className="text-sm font-bold text-gray-800 mb-2"> 1. 描述你的游戏</p>
            <p className="text-sm text-gray-600 leading-9">
              我的游戏叫
              <input value={(answers.q1 || {}).name || ""} onChange={e => setAns("q1","name",e.target.value)}
                placeholder="游戏名称" className="inline-block mx-1 px-1 min-w-[120px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm"
                style={{ width: `${Math.max(120, ((answers.q1||{}).name||"").length*16+20)}px` }} />
              ，玩法是
              <input value={(answers.q1 || {}).play || ""} onChange={e => setAns("q1","play",e.target.value)}
                placeholder="怎么玩的" className="inline-block mx-1 px-1 min-w-[150px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm"
                style={{ width: `${Math.max(150, ((answers.q1||{}).play||"").length*16+20)}px` }} />
              。
              <VoiceButton onResult={(t) => setAns("q1","play", ((answers.q1||{}).play||"")+t)} />
            </p>
          </div>

          {/* Q2 */}
          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-800 mb-2"> 2. 说明你的规则</p>
            <p className="text-sm text-gray-600 leading-9">
              如果
              <input value={(answers.q2 || {}).cond || ""} onChange={e => setAns("q2","cond",e.target.value)}
                placeholder="什么情况" className="inline-block mx-1 px-1 min-w-[140px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm"
                style={{ width: `${Math.max(140, ((answers.q2||{}).cond||"").length*16+20)}px` }} />
              ，就
              <input value={(answers.q2 || {}).result || ""} onChange={e => setAns("q2","result",e.target.value)}
                placeholder="发生什么" className="inline-block mx-1 px-1 min-w-[140px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm"
                style={{ width: `${Math.max(140, ((answers.q2||{}).result||"").length*16+20)}px` }} />
              。
              <VoiceButton onResult={(t) => setAns("q2","result", ((answers.q2||{}).result||"")+t)} />
            </p>
          </div>

          {/* Q3 */}
          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-800 mb-2"> 3. 遇到的困难</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {CHOICES.difficulty.map(opt => (
                <button key={opt} onClick={() => setAns("q3","difficulty",opt)}
                  className={`px-2 py-1 rounded-lg text-xs transition ${(answers.q3||{}).difficulty === opt ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{opt}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {CHOICES.solve.map(opt => (
                <button key={opt} onClick={() => setAns("q3","solve",opt)}
                  className={`px-2 py-1 rounded-lg text-xs transition ${(answers.q3||{}).solve === opt ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{opt}</button>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              困难：
              <input value={(answers.q3 || {}).difficulty || ""} onChange={e => setAns("q3","difficulty",e.target.value)}
                placeholder="点上面或自己写" className="inline-block mx-1 px-1 min-w-[180px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm" />
              ，用了
              <input value={(answers.q3 || {}).solve || ""} onChange={e => setAns("q3","solve",e.target.value)}
                placeholder="解决方式" className="inline-block mx-1 px-1 min-w-[140px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm" />
              方法解决。
            </p>
          </div>

          {/* Q4 */}
          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-800 mb-2"> 4. 同伴的反馈</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {CHOICES.feedback.map(opt => (
                <button key={opt} onClick={() => setAns("q4","feedback",opt)}
                  className={`px-2 py-1 rounded-lg text-xs transition ${(answers.q4||{}).feedback === opt ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{opt}</button>
              ))}
              {CHOICES.feel.map(opt => (
                <button key={opt} onClick={() => setAns("q4","feel",opt)}
                  className={`px-2 py-1 rounded-lg text-xs transition ${(answers.q4||{}).feel === opt ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{opt}</button>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              同伴说：
              <input value={(answers.q4 || {}).feedback || ""} onChange={e => setAns("q4","feedback",e.target.value)}
                placeholder="同伴的评价" className="inline-block mx-1 px-1 min-w-[160px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm" />
              ，我觉得
              <input value={(answers.q4 || {}).feel || ""} onChange={e => setAns("q4","feel",e.target.value)}
                placeholder="我的感受" className="inline-block mx-1 px-1 min-w-[150px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm" />
              。
            </p>
          </div>

          {/* Q5 */}
          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-800 mb-2"> 5. 如果重新做</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {CHOICES.redo.map(opt => (
                <button key={opt} onClick={() => setAns("q5","redo",opt)}
                  className={`px-2 py-1 rounded-lg text-xs transition ${(answers.q5||{}).redo === opt ? "bg-purple-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{opt}</button>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              会改
              <input value={(answers.q5 || {}).redo || ""} onChange={e => setAns("q5","redo",e.target.value)}
                placeholder="点上面或自己写" className="inline-block mx-1 px-1 min-w-[200px] border-b-2 border-gray-300 focus:border-indigo-500 outline-none text-sm" />
              。
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-10 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white rounded-xl text-base font-bold transition shadow-lg"
        >{saving ? "保存中..." : "提交反思 ✅"}</button>
      </div>
    </div>
  );
}
