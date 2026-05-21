"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";

const APPLE_GAME = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>接苹果</title><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#87CEEB}
</style></head><body>
<canvas id="c"></canvas>
<script>
const c=document.getElementById('c');
c.width=window.innerWidth;
c.height=window.innerHeight;
const ctx=c.getContext('2d');
let basket={x:c.width/2-8,w:16},apples=[],speed=4.5,score=0;
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft')basket.x=Math.max(0,basket.x-20);
  if(e.key==='ArrowRight')basket.x=Math.min(c.width-basket.w,basket.x+20);
});
function loop(){
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle='#8B4513';ctx.fillRect(basket.x,c.height-40,basket.w,16);
  if(Math.random()<0.03)apples.push({x:Math.random()*(c.width-14),y:0,r:7});
  for(let i=apples.length-1;i>=0;i--){
    let a=apples[i];a.y+=speed;
    ctx.fillStyle='#FF4444';ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#228B22';ctx.fillRect(a.x-2,a.y-a.r-6,4,6);
    if(a.y>c.height-44&&a.x>basket.x&&a.x<basket.x+basket.w){apples.splice(i,1);score++;}
    if(a.y>c.height)apples.splice(i,1);
  }
  requestAnimationFrame(loop);
}loop();</script></body></html>`;

const QUESTIONS = [
  {
    id: 1,
    title: "第 1 题（多选题）",
    subtitle: "你玩了这个接苹果游戏。你觉得这个游戏有哪些地方可以变得更好？",
    multi: true,
    options: [
      { label: "苹果掉得太快了，还没反应过来就掉下去了，不好接", score: 1, defect: "speed" },
      { label: "我控制的篮子太小了，有时候看不清它在哪", score: 1, defect: "size" },
      { label: "接到了苹果什么反应都没有，不知道得了几分", score: 2, defect: "feedback" },
      { label: "苹果的颜色不好看，我想换一个颜色", score: 0, defect: null },
      { label: "这个游戏太短了，我想让它一直玩", score: 0, defect: null },
    ],
  },
  {
    id: 2,
    title: "第 2 题（单选题）",
    subtitle: "如果只能改一个地方，你觉得最应该改哪里？",
    multi: false,
    options: [
      { label: "把速度调慢——因为太快了接不到，我会很着急", score: 1, type: "surface_self" },
      { label: "把速度调慢——因为游戏要让玩的人能接到东西，不然太受打击了", score: 2, type: "system_player" },
      { label: "把篮子变大——因为太小了，我看不清楚", score: 1, type: "surface_self" },
      { label: "把篮子变大——因为玩的人要一眼就看到自己控制的角色在哪，才能专心玩游戏", score: 2, type: "system_player" },
      { label: "加上分数显示——因为现在不知道得了几分，玩的人不知道自己厉不厉害", score: 2, type: "system_feedback" },
      { label: "换一个好看的背景", score: 0, type: "irrelevant" },
    ],
  },
  {
    id: 3,
    title: "第 3 题（单选题）",
    subtitle: "如果把苹果掉下来的速度调慢，你最同意下面哪句话？",
    multi: false,
    options: [
      { label: "游戏会变简单，更容易接到苹果了", score: 1, type: "direct" },
      { label: "游戏会变简单，但如果太慢了，玩的人会觉得太简单不好玩", score: 2, type: "system_risk" },
      { label: "游戏会变简单，接起来不费劲了——要是再加一个分数，接到的时候分数往上跳，玩的人会更有成就感", score: 2, type: "system_improve" },
      { label: "游戏不会有什么变化", score: 0, type: "wrong" },
      { label: "游戏会变难，因为慢了就更难把握时机", score: 0, type: "wrong" },
    ],
  },
];

interface Props {
  convId: string;
  onComplete: () => void;
}

async function getToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch { return ""; }
}

function shuffle(arr: any[]): any[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ClassificationModal({ convId, onComplete }: Props) {
  const GAME_TIME = 20;
  const THINK_TIME = 10;

  const [gameStarted, setGameStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [phase, setPhase] = useState<"game" | "questions" | "done">("game");
  const [currentQ, setCurrentQ] = useState(0);
  const [thinkLeft, setThinkLeft] = useState(THINK_TIME);
  const [canAnswer, setCanAnswer] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string[]>>({ 1: [], 2: [], 3: [] });
  const [saving, setSaving] = useState(false);
  const [shuffledQuestions] = useState(() => QUESTIONS.map((q) => ({ ...q, options: shuffle(q.options) })));
  const [startTime] = useState(() => Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const thinkRef = useRef<NodeJS.Timeout | null>(null);

  // 游戏倒计时
  useEffect(() => {
    if (gameStarted && phase === "game" && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    if (timeLeft === 0 && phase === "game") {
      setPhase("questions");
      setCurrentQ(0);
      setThinkLeft(THINK_TIME);
      setCanAnswer(false);
    }
  }, [gameStarted, timeLeft, phase]);

  // 思考倒计时（每题进入时）
  useEffect(() => {
    if (phase === "questions" && thinkLeft > 0 && !canAnswer) {
      thinkRef.current = setTimeout(() => setThinkLeft((t) => t - 1), 1000);
      return () => { if (thinkRef.current) clearTimeout(thinkRef.current); };
    }
    if (thinkLeft === 0 && !canAnswer) {
      setCanAnswer(true);
    }
  }, [phase, thinkLeft, canAnswer, currentQ]); // currentQ triggers reset

  // 切换题目时重置思考倒计时
  const goToQuestion = (idx: number) => {
    setCurrentQ(idx);
    setThinkLeft(THINK_TIME);
    setCanAnswer(false);
  };

  const toggleOption = (qId: number, label: string, multi: boolean) => {
    if (!canAnswer) return;
    setAnswers((prev) => {
      const current = prev[qId] || [];
      if (multi) {
        if (current.includes(label)) return { ...prev, [qId]: current.filter((l) => l !== label) };
        return { ...prev, [qId]: [...current, label] };
      }
      return { ...prev, [qId]: [label] };
    });
  };

  const q = shuffledQuestions[currentQ];
  const isLastQ = currentQ === shuffledQuestions.length - 1;
  const hasAnswered = (answers[q?.id] || []).length > 0;

  const allAnswered = answers[1].length > 0 && answers[2].length > 0 && answers[3].length > 0;

  const calcScores = useCallback(() => {
    let q1 = 0, q2 = 0, q3 = 0;
    const q1Opts = shuffledQuestions[0].options;
    const q2Opts = shuffledQuestions[1].options;
    const q3Opts = shuffledQuestions[2].options;

    const q1Answers = answers[1] || [];
    const hasFeedback = q1Answers.some((a) => q1Opts.find((o) => o.label === a)?.defect === "feedback");
    const hasSurface = q1Answers.some((a) => {
      const o = q1Opts.find((o) => o.label === a);
      return o?.defect === "speed" || o?.defect === "size";
    });
    if (hasFeedback) q1 = 2;
    else if (hasSurface) q1 = 1;

    const q2Ans = answers[2]?.[0];
    const q2Opt = q2Opts.find((o) => o.label === q2Ans);
    if (q2Opt) q2 = q2Opt.score;

    const q3Ans = answers[3]?.[0];
    const q3Opt = q3Opts.find((o) => o.label === q3Ans);
    if (q3Opt) q3 = q3Opt.score;

    const total = q1 + q2 + q3;
    const group = total >= 4 ? "high_srl" : "low_srl";
    return { q1, q2, q3, total, group };
  }, [answers, shuffledQuestions]);

  const handleComplete = async () => {
    if (!allAnswered) return;
    setSaving(true);
    const scores = calcScores();
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    try {
      const token = await getToken();
      if (token) {
        await fetch("/api/student/classification", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            conversation_id: convId,
            q1_answers: answers[1],
            q2_answer: answers[2][0],
            q3_answer: answers[3][0],
            q1_score: scores.q1,
            q2_score: scores.q2,
            q3_score: scores.q3,
            total_score: scores.total,
            group: scores.group,
            total_time: totalTime,
          }),
        });
      }
    } catch (err) {
      console.error("保存分类失败:", err);
    } finally {
      setSaving(false);
      setPhase("done");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-2">
      <div className="bg-white rounded-3xl shadow-2xl w-[70%] h-[80%] flex flex-col overflow-hidden">
        {/* 顶栏 */}
        <div className="bg-indigo-600 text-white px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <span className="text-2xl">🎮</span>
          <h2 className="text-lg font-bold">
            {phase === "game" && "先来玩一玩这个游戏吧！"}
            {phase === "questions" && `第 ${currentQ + 1} / 3 题`}
            {phase === "done" && "完成！"}
          </h2>
          {phase === "game" && (
            <span className={`ml-auto text-xl font-bold ${timeLeft <= 5 ? "text-yellow-300 animate-pulse" : ""}`}>
              ⏱ {timeLeft}秒
            </span>
          )}
          {phase === "questions" && !canAnswer && (
            <span className="ml-auto text-yellow-300 text-sm animate-pulse">⏳ 请认真思考 {thinkLeft}秒</span>
          )}
          {/* 提示条 */}
          {phase === "questions" && (
            <span className="ml-auto text-xs text-indigo-200 bg-indigo-500 px-3 py-1 rounded-full">
              📝 请认真回答问题
            </span>
          )}
        </div>

        {/* 主体：左右布局 */}
        <div className="flex-1 min-h-0 flex">
          {/* 左侧：游戏 */}
          <div className="flex-1 min-w-0 border-r border-gray-200">
            {gameStarted ? (
              <iframe srcDoc={APPLE_GAME} className="w-full h-full" sandbox="allow-scripts" scrolling="no" />
            ) : (
              <div
                className="w-full h-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center cursor-pointer hover:from-sky-200 hover:to-blue-200 transition"
                onClick={() => setGameStarted(true)}
              >
                <div className="text-center">
                  <p className="text-7xl mb-4 animate-bounce">🍎</p>
                  <p className="text-2xl font-bold text-gray-700">点击开始游戏</p>
                  <p className="text-lg text-gray-500 mt-2">用 ← → 方向键移动篮子接苹果</p>
                </div>
              </div>
            )}
          </div>

          {/* 右侧：题目 */}
          <div className="w-[45%] flex-shrink-0 flex flex-col overflow-y-auto p-6 bg-gray-50">
            {phase === "game" && (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <p className="text-4xl mb-3">⏳</p>
                  <p className="text-xl text-gray-500 font-medium">先玩一玩游戏</p>
                  <p className="text-gray-400 mt-2">时间到了会出现问题哦～</p>
                </div>
              </div>
            )}

            {phase === "questions" && q && (
              <div className="flex flex-col h-full">
                {/* 题目进度 */}
                <div className="flex gap-2 mb-4">
                  {shuffledQuestions.map((_, i) => (
                    <div key={i} className={`flex-1 h-2 rounded-full transition ${i < currentQ ? "bg-green-400" : i === currentQ ? "bg-indigo-500" : "bg-gray-200"}`} />
                  ))}
                </div>

                {/* 题目卡片 */}
                <div className="flex-1 flex flex-col">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 mb-1">{q.title}</h3>
                    <p className="text-sm text-gray-500 mb-4">{q.subtitle}</p>

                    {!canAnswer ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-5xl mb-3 animate-pulse">🤔</p>
                          <p className="text-2xl font-bold text-indigo-600">{thinkLeft}</p>
                          <p className="text-sm text-gray-400 mt-1">秒后可以作答</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const selected = (answers[q.id] || []).includes(opt.label);
                          return (
                            <button
                              key={opt.label}
                              onClick={() => toggleOption(q.id, opt.label, q.multi)}
                              className={`w-full text-left p-3 rounded-xl border-2 transition ${
                                selected
                                  ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                              }`}
                            >
                              <span className="text-sm">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 已选提示 + 按钮 */}
                    <div className="mt-4 flex items-center justify-between">
                      <span className={`text-xs ${hasAnswered ? "text-green-500" : "text-gray-300"}`}>
                        {hasAnswered ? "✓ 已作答" : "○ 请选择"}
                      </span>
                      {canAnswer && (
                        <div className="flex gap-2">
                          {isLastQ ? (
                            <button
                              onClick={handleComplete}
                              disabled={!allAnswered || saving}
                              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-2 rounded-xl text-sm font-medium transition"
                            >
                              {saving ? "提交中..." : "✅ 提交答案"}
                            </button>
                          ) : (
                            <button
                              onClick={() => goToQuestion(currentQ + 1)}
                              disabled={!hasAnswered}
                              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-2 rounded-xl text-sm font-medium transition"
                            >
                              下一题 →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === "done" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <p className="text-6xl">🎉</p>
                <p className="text-2xl font-bold text-gray-800">恭喜你发现了游戏的不足！</p>
                <p className="text-lg text-gray-500">接下来让我们创造属于我们自己的游戏吧！</p>
                <button
                  onClick={onComplete}
                  className="mt-6 bg-indigo-500 hover:bg-indigo-600 text-white px-10 py-3 rounded-2xl text-xl font-bold transition"
                >
                  🚀 开始创作
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
