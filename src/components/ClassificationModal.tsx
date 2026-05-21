"use client";

import { useState, useRef } from "react";
import { supabase } from "@/components/SupabaseProvider";

// 故意有缺陷的游戏：星星太小、下落太快、没有分数显示
const DEFECTIVE_GAME = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>接星星</title><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#f5f5f5}
canvas{display:block;margin:0 auto;background:#f5f5f5}
</style></head><body>
<canvas id="c"></canvas>
<script>
const c=document.getElementById('c');
c.width=window.innerWidth;
c.height=window.innerHeight;
const ctx=c.getContext('2d');
let basket={x:c.width/2-30,w:60},stars=[],speed=5;
c.addEventListener('mousemove',e=>{basket.x=e.clientX-basket.w/2});
c.addEventListener('touchmove',e=>{basket.x=e.touches[0].clientX-basket.w/2});
function loop(){
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle='#8B4513';ctx.fillRect(basket.x,c.height-50,basket.w,20);
  if(Math.random()<0.03)stars.push({x:Math.random()*(c.width-10),y:0,r:4});
  for(let i=stars.length-1;i>=0;i--){
    let s=stars[i];s.y+=speed;
    ctx.fillStyle='#FFD700';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
    if(s.y>c.height-60&&s.x>basket.x&&s.x<basket.x+basket.w)stars.splice(i,1);
    if(s.y>c.height)stars.splice(i,1);
  }
  requestAnimationFrame(loop);
}loop();</script></body></html>`;

const ROUNDS = [
  {
    step: 1,
    title: "第 1 步：试玩游戏",
    subtitle: "请先玩一下这个接星星游戏～",
    showGame: true,
    choices: [] as { label: string; value: string }[],
    instruction: "玩过游戏后，点击下方按钮继续",
    buttonText: "我玩好了，继续 →",
  },
  {
    step: 2,
    title: "第 2 步：说说感受",
    subtitle: "你觉得这个游戏怎么样？",
    showGame: false,
    choices: [
      { label: "挺好玩的，我很喜欢", value: "positive_enjoy" },
      { label: "不太好玩，感觉少了点什么", value: "negative_missing" },
      { label: "还行，但玩一会就没意思了", value: "neutral_boring" },
      { label: "我不确定，说不清楚", value: "unsure" },
    ],
    instruction: "选一个最符合你感受的选项",
    buttonText: "",
  },
  {
    step: 3,
    title: "第 3 步：提个建议",
    subtitle: "如果只能改一个地方，你最想改什么？",
    showGame: false,
    choices: [
      { label: "把星星变大一点", value: "change_size" },
      { label: "让星星掉慢一些", value: "change_speed" },
      { label: "加上分数显示", value: "change_display" },
      { label: "让篮子能左右移动", value: "change_control" },
    ],
    instruction: "选一个你最想改的地方",
    buttonText: "",
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

export default function ClassificationModal({ convId, onComplete }: Props) {
  const [round, setRound] = useState(0);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const playedRef = useRef(false);

  const current = ROUNDS[round];
  const isLast = round === ROUNDS.length - 1;

  const handleChoice = (value: string) => {
    setChoices((prev) => ({ ...prev, [round]: value }));
  };

  const handleNext = () => {
    if (round < ROUNDS.length - 1) {
      setRound(round + 1);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (token) {
        await fetch("/api/student/classification", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            conversation_id: convId,
            q1_choice: choices[1] || "",
            q2_choice: choices[2] || "",
          }),
        });
      }
    } catch (err) {
      console.error("保存分类失败:", err);
    } finally {
      setSaving(false);
      onComplete();
    }
  };

  const canProceedRound0 = round === 0 && playedRef.current;
  const canProceed = round === 0 ? canProceedRound0 : !!choices[round];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* 顶栏 + 进度 */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center gap-4 flex-shrink-0">
          <span className="text-3xl">🎮</span>
          <div className="flex-1">
            <h2 className="text-lg font-bold">{current.title}</h2>
            <p className="text-sm text-indigo-200">{current.subtitle}</p>
          </div>
          <div className="flex gap-1">
            {ROUNDS.map((_, i) => (
              <div key={i} className={`w-8 h-1.5 rounded-full transition ${i <= round ? "bg-white" : "bg-indigo-400"}`} />
            ))}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {/* 游戏预览（仅第1轮） */}
          {current.showGame && (
            <div className="mb-6">
              <div className="rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-50">
                {gameStarted ? (
                  <iframe
                    srcDoc={DEFECTIVE_GAME}
                    className="w-full h-[50vh]"
                    sandbox="allow-scripts"
                    scrolling="no"
                    onLoad={() => { playedRef.current = true; }}
                  />
                ) : (
                  <div
                    className="w-full h-[50vh] bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center cursor-pointer hover:from-indigo-100 hover:to-purple-100 transition"
                    onClick={() => { setGameStarted(true); playedRef.current = true; }}
                  >
                    <div className="text-center">
                      <p className="text-6xl mb-4 animate-bounce">▶️</p>
                      <p className="text-xl font-bold text-indigo-600">点击开始游戏</p>
                      <p className="text-sm text-indigo-400 mt-2">玩 1-2 分钟后继续</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 选项（仅第2、3轮） */}
          {current.choices.length > 0 && (
            <div className="space-y-3">
              {current.choices.map((choice) => (
                <button
                  key={choice.value}
                  onClick={() => handleChoice(choice.value)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition text-lg ${
                    choices[round] === choice.value
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-md"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}

          {/* 提示文字 */}
          <p className="text-center text-sm text-gray-400 mt-6">{current.instruction}</p>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-center flex-shrink-0">
          {round === 0 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-10 py-3 rounded-xl text-lg font-medium transition"
            >
              {current.buttonText}
            </button>
          ) : isLast ? (
            <button
              onClick={handleComplete}
              disabled={!canProceed || saving}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-10 py-3 rounded-xl text-lg font-medium transition"
            >
              {saving ? "保存中..." : "✅ 完成，开始创作！"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-10 py-3 rounded-xl text-lg font-medium transition"
            >
              继续下一题 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
