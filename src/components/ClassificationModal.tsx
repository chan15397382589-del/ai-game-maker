"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";

// 游戏参数
interface GameParams {
  speed: number;
  basketW: number;
  showScore: boolean;
  showFireworks: boolean;
  title: string;
}

// 构建游戏 HTML
function buildGame(params: GameParams): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${params.title}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#87CEEB}
#score{position:absolute;top:10px;left:50%;transform:translateX(-50%);font-size:28px;font-weight:bold;
  color:${params.showScore?'#FFD700':'transparent'};font-family:Arial;text-shadow:2px 2px 4px rgba(0,0,0,0.5);z-index:10}
</style></head><body>
${params.showScore?'<div id="score">0</div>':''}
<canvas id="c"></canvas>
<script>
const c=document.getElementById('c');
c.width=window.innerWidth;c.height=window.innerHeight;
const ctx=c.getContext('2d');
let basket={x:c.width/2-${params.basketW/2},w:${params.basketW}},apples=[],speed=${params.speed},score=0;
let particles=[];
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft')basket.x=Math.max(0,basket.x-25);
  if(e.key==='ArrowRight')basket.x=Math.min(c.width-basket.w,basket.x+25);
});
${params.showFireworks?`
function spawnFireworks(x,y){
  for(let i=0;i<15;i++){particles.push({x,y,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:25,color:'hsl('+Math.random()*360+',100%,60%)'});}
}`:'function spawnFireworks(x,y){}'}
function loop(){
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle='#8B4513';ctx.fillRect(basket.x,c.height-40,basket.w,16);
  if(Math.random()<0.03)apples.push({x:Math.random()*(c.width-14),y:0,r:7});
  for(let i=apples.length-1;i>=0;i--){
    let a=apples[i];a.y+=speed;
    ctx.fillStyle='#FF4444';ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#228B22';ctx.fillRect(a.x-2,a.y-a.r-6,4,6);
    if(a.y>c.height-44&&a.x>basket.x&&a.x<basket.x+basket.w){apples.splice(i,1);score++;${params.showScore?'document.getElementById("score").textContent=score*10;':''}spawnFireworks(a.x,a.y);}
    if(a.y>c.height)apples.splice(i,1);
  }
  for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.x+=p.vx;p.y+=p.vy;p.life--;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();if(p.life<=0)particles.splice(i,1);}
  requestAnimationFrame(loop);
}loop();</script></body></html>`;
}

const DEFAULT_PARAMS: GameParams = { speed: 5, basketW: 16, showScore: false, showFireworks: false, title: "接苹果" };

// ====== 阶段一问题（三年级语言） ======
const PHASE1_QUESTIONS = [
  {
    id: 1,
    title: "第 1 题",
    subtitle: "这个游戏有哪些地方可以变得更好？（可以多选几个）",
    multi: true,
    options: [
      { label: "苹果掉得太快了，不好接", score: 1 },
      { label: "篮子太小了，看不清", score: 1 },
      { label: "接到了苹果什么反应都没有", score: 2 },
      { label: "颜色不好看", score: 0 },
      { label: "一下子就结束了", score: 0 },
    ],
  },
  {
    id: 2,
    title: "第 2 题",
    subtitle: "如果只能改一个地方，你觉得最应该改哪里？",
    multi: false,
    options: [
      { label: "把苹果变慢——太快了我接不到", score: 1 },
      { label: "把苹果变慢——太快要不然玩的人会不想玩", score: 2 },
      { label: "加个分数——想知道自己得了几分", score: 2 },
      { label: "把篮子变大——太小了不好找", score: 1 },
      { label: "把篮子变大——玩的人要看得见才行", score: 2 },
      { label: "换个好看的背景", score: 0 },
    ],
  },
  {
    id: 3,
    title: "第 3 题",
    subtitle: "如果把苹果的速度变慢，你最同意哪句话？",
    multi: false,
    options: [
      { label: "变简单了，好接了", score: 1 },
      { label: "变简单了——太简单了也会无聊", score: 2 },
      { label: "变简单了——要是再加个分数就更好玩了", score: 2 },
      { label: "没什么变化", score: 0 },
      { label: "变难了", score: 0 },
    ],
  },
];

// ====== 阶段二：小智老师陪你改游戏 ======
const PHASE2_ROUNDS = [
  {
    id: "speed",
    teacherText: "苹果掉得太快了是不是？我们来让它慢下来～你想让它怎么掉？",
    options: [
      { emoji: "🐢", label: "慢悠悠地飘下来", desc: "苹果像羽毛一样慢慢飘落", mod: (p: GameParams) => ({ ...p, speed: 2 }) },
      { emoji: "🐇", label: "比刚才慢一点就行", desc: "不快不慢，认真看就能接到", mod: (p: GameParams) => ({ ...p, speed: 3.5 }) },
    ],
    feedback: {
      "0": "哇，好慢！现在每个苹果你都能看清楚了～",
      "1": "好的，不快不慢了！你试试能接中几个～",
    },
  },
  {
    id: "size",
    teacherText: "再看看你接苹果的篮子——是不是有点小？要不要变大？",
    options: [
      { emoji: "👍", label: "变大！", desc: "篮子变大很多", mod: (p: GameParams) => ({ ...p, basketW: 50 }) },
      { emoji: "👆", label: "变大一点点", desc: "还是要认真才能接住", mod: (p: GameParams) => ({ ...p, basketW: 30 }) },
      { emoji: "✋", label: "不用变，小小的才好", desc: "你就是喜欢挑战", mod: (p: GameParams) => ({ ...p }) },
    ],
    feedback: {
      "0": "好大的篮子！现在一接一个准～",
      "1": "嗯，还是要专心接——这样接到的时候更开心！",
      "2": "厉害！你喜欢难的——那我们来改下一个东西。",
    },
  },
  {
    id: "feedback",
    teacherText: "你发现没有——接到苹果的时候，什么动静都没有？就像你考试得了100分，但是老师什么都没说。是不是少点什么？我们给接到苹果的时候加一个好玩的东西！",
    options: [
      { emoji: "🔢", label: "加分数！", desc: "接到苹果就加10分", mod: (p: GameParams) => ({ ...p, showScore: true }) },
      { emoji: "✨", label: "加烟花！", desc: "苹果炸开变成小星星", mod: (p: GameParams) => ({ ...p, showFireworks: true }) },
      { emoji: "🎯", label: "两个都要！", desc: "又有分数又有烟花", mod: (p: GameParams) => ({ ...p, showScore: true, showFireworks: true }) },
    ],
    feedback: {
      "0": "数字跳出来！现在你每次接到苹果都会知道自己得了几分～",
      "1": "嘭！星星炸开！好看吧——每次接到苹果都像放烟花～",
      "2": "分数+烟花！又好看又知道分数——这个设计最厉害了！",
    },
  },
  {
    id: "name",
    teacherText: "好啦！这已经是一个全新的游戏了！给它取个名字吧～",
    options: [
      { emoji: "📛", label: "就叫《接苹果》", desc: "", mod: (p: GameParams) => ({ ...p, title: "接苹果" }) },
      { emoji: "✏️", label: "我自己取一个！", desc: "", mod: (p: GameParams) => p },
      { emoji: "🤔", label: "你帮我取", desc: "", mod: (p: GameParams) => ({ ...p, title: "超级接苹果" }) },
    ],
    feedback: {
      "0": "好！《接苹果》——简单好记！",
      "1": "哇你自己取的名字！太棒了！",
      "2": "那我帮你取……叫《超级接苹果》！",
    },
    isNameRound: true,
  },
];

function shuffle(arr: any[]): any[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

interface Props { convId: string; onComplete: () => void; }

async function getToken(): Promise<string> {
  try { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token || ""; } catch { return ""; }
}

export default function ClassificationModal({ convId, onComplete }: Props) {
  const GAME_TIME = 15;
  const THINK_TIME = 5;

  // 通用状态
  const [gameStarted, setGameStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [phase, setPhase] = useState<"game" | "phase1" | "phase2" | "done">("game");
  const [startTime] = useState(() => Date.now());

  // 游戏参数
  const [gameParams, setGameParams] = useState<GameParams>(DEFAULT_PARAMS);
  const gameRef = useRef<HTMLIFrameElement>(null);

  // 阶段一
  const [phase1Q, setPhase1Q] = useState(0);
  const [thinkLeft, setThinkLeft] = useState(THINK_TIME);
  const [canAnswer, setCanAnswer] = useState(false);
  const [phase1Answers, setPhase1Answers] = useState<Record<number, string[]>>({ 1: [], 2: [], 3: [] });
  const [p1Shuffled] = useState(() => PHASE1_QUESTIONS.map((q) => ({ ...q, options: shuffle(q.options) })));

  // 阶段二
  const [phase2Round, setPhase2Round] = useState(0);
  const [phase2Choices, setPhase2Choices] = useState<string[]>([]);
  const [phase2Feedback, setPhase2Feedback] = useState("");
  const [customName, setCustomName] = useState("");
  const [playerNameChoice, setPlayerNameChoice] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const thinkRef = useRef<NodeJS.Timeout | null>(null);

  // 游戏倒计时
  useEffect(() => {
    if (gameStarted && phase === "game" && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    if (timeLeft === 0 && phase === "game") {
      setPhase("phase1");
      setPhase1Q(0);
      setThinkLeft(THINK_TIME);
      setCanAnswer(false);
    }
  }, [gameStarted, timeLeft, phase]);

  // 阶段一思考倒计时
  useEffect(() => {
    if (phase === "phase1" && thinkLeft > 0 && !canAnswer) {
      thinkRef.current = setTimeout(() => setThinkLeft((t) => t - 1), 1000);
      return () => { if (thinkRef.current) clearTimeout(thinkRef.current); };
    }
    if (thinkLeft === 0 && !canAnswer) setCanAnswer(true);
  }, [phase, thinkLeft, canAnswer, phase1Q]);

  const goPhase1Q = (idx: number) => { setPhase1Q(idx); setThinkLeft(THINK_TIME); setCanAnswer(false); };

  const toggleP1Option = (qId: number, label: string, multi: boolean) => {
    if (!canAnswer) return;
    setPhase1Answers((prev) => {
      const cur = prev[qId] || [];
      if (multi) return { ...prev, [qId]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] };
      return { ...prev, [qId]: [label] };
    });
  };

  const p1Done = phase1Answers[1].length > 0 && phase1Answers[2].length > 0 && phase1Answers[3].length > 0;

  const calcP1Scores = useCallback(() => {
    let q1 = 0, q2 = 0, q3 = 0;
    const q1A = phase1Answers[1] || [];
    const hasFeedback = q1A.some((a) => a.includes("什么反应都没有"));
    const hasSurface = q1A.some((a) => a.includes("太快") || a.includes("太小"));
    if (hasFeedback) q1 = 2; else if (hasSurface) q1 = 1;
    const q2Ans = phase1Answers[2]?.[0] || "";
    const q2Opts = p1Shuffled[1].options;
    const q2Opt = q2Opts.find((o) => o.label === q2Ans);
    if (q2Opt) q2 = q2Opt.score;
    const q3Ans = phase1Answers[3]?.[0] || "";
    const q3Opts = p1Shuffled[2].options;
    const q3Opt = q3Opts.find((o) => o.label === q3Ans);
    if (q3Opt) q3 = q3Opt.score;
    const total = q1 + q2 + q3;
    return { q1, q2, q3, total, group: total >= 4 ? "high_srl" : "low_srl" };
  }, [phase1Answers, p1Shuffled]);

  // 阶段一完成 → 阶段二
  const startPhase2 = () => {
    setPhase("phase2");
    setPhase2Round(0);
    setPhase2Feedback("");
    setGameParams(DEFAULT_PARAMS);
  };

  // 阶段二选择
  const handlePhase2Choice = (choiceIdx: number) => {
    const round = PHASE2_ROUNDS[phase2Round];
    if (round.isNameRound && choiceIdx === 1) {
      // 自定义名字
      setPlayerNameChoice("custom");
      return;
    }
    const mod = round.options[choiceIdx].mod;
    const newParams = mod(gameParams);
    setGameParams(newParams);
    setPhase2Choices((prev) => [...prev, String(choiceIdx)]);
    setPhase2Feedback((round.feedback as Record<string, string>)[String(choiceIdx)] || "");
  };

  const submitCustomName = () => {
    const name = customName.trim() || "超级接苹果";
    setGameParams((p) => ({ ...p, title: name }));
    setPhase2Choices((prev) => [...prev, "1"]);
    setPhase2Feedback("哇你自己取的名字！太棒了！");
    setPlayerNameChoice(null);
  };

  const nextPhase2Round = () => {
    if (phase2Round < PHASE2_ROUNDS.length - 1) {
      setPhase2Round((r) => r + 1);
      setPhase2Feedback("");
    } else {
      // 完成全部
      handleComplete();
    }
  };

  // 保存所有数据
  const handleComplete = async () => {
    const scores = calcP1Scores();
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    try {
      const token = await getToken();
      if (token) {
        await fetch("/api/student/classification", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            conversation_id: convId,
            q1_answers: phase1Answers[1],
            q2_answer: phase1Answers[2]?.[0] || "",
            q3_answer: phase1Answers[3]?.[0] || "",
            q1_score: scores.q1, q2_score: scores.q2, q3_score: scores.q3,
            total_score: scores.total, group: scores.group, total_time: totalTime,
            phase2_choices: phase2Choices,
            phase2_final_params: gameParams,
          }),
        });
      }
    } catch (err) { console.error("保存失败:", err); }
    setPhase("done");
  };

  const p1q = p1Shuffled[phase1Q];
  const p1IsLast = phase1Q === p1Shuffled.length - 1;
  const p1HasAnswered = (phase1Answers[p1q?.id] || []).length > 0;

  const p2round = PHASE2_ROUNDS[phase2Round];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-2">
      <div className="bg-white rounded-3xl shadow-2xl w-[70%] h-[82%] flex flex-col overflow-hidden">
        {/* 顶栏 */}
        <div className="bg-indigo-600 text-white px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8"><XiaozhiAvatar state={phase === "game" ? "idle" : "thinking"} /></div>
          <h2 className="text-base font-bold">
            {phase === "game" && "先来玩一玩这个游戏吧！"}
            {phase === "phase1" && `第 ${phase1Q + 1} / 3 题`}
            {phase === "phase2" && `小智老师陪你改游戏 (${phase2Round + 1}/4)`}
            {phase === "done" && "完成！"}
          </h2>
          <span className="ml-auto text-xs bg-indigo-500 px-2 py-1 rounded-full">📝 请认真回答</span>
          {phase === "game" && (
            <span className={`text-lg font-bold ${timeLeft <= 5 ? "text-yellow-300 animate-pulse" : ""}`}>⏱ {timeLeft}秒</span>
          )}
          {phase === "phase1" && !canAnswer && (
            <span className="text-yellow-300 text-sm animate-pulse">⏳ {thinkLeft}秒</span>
          )}
        </div>

        {/* 主体 */}
        <div className="flex-1 min-h-0 flex">
          {/* 左侧：游戏 */}
          <div className="flex-1 min-w-0 border-r border-gray-200">
            {gameStarted ? (
              <iframe ref={gameRef} srcDoc={buildGame(gameParams)} className="w-full h-full" sandbox="allow-scripts" scrolling="no" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center cursor-pointer hover:from-sky-200 hover:to-blue-200 transition"
                onClick={() => setGameStarted(true)}>
                <div className="text-center">
                  <p className="text-7xl mb-4 animate-bounce">🍎</p>
                  <p className="text-2xl font-bold text-gray-700">点击开始游戏</p>
                  <p className="text-lg text-gray-500 mt-2">用 ← → 方向键移动篮子接苹果</p>
                </div>
              </div>
            )}
          </div>

          {/* 右侧 */}
          <div className="w-[45%] flex-shrink-0 flex flex-col overflow-y-auto p-5 bg-gray-50">
            {/* 游戏阶段 */}
            {phase === "game" && (
              <div className="flex items-center justify-center h-full text-center">
                <div><p className="text-4xl mb-3">⏳</p><p className="text-xl text-gray-500 font-medium">先玩一玩游戏</p><p className="text-gray-400 mt-2">时间到了会出现问题哦～</p></div>
              </div>
            )}

            {/* 阶段一：答题 */}
            {phase === "phase1" && p1q && (
              <div className="flex flex-col h-full">
                <div className="flex gap-2 mb-4">
                  {p1Shuffled.map((_, i) => <div key={i} className={`flex-1 h-2 rounded-full ${i < phase1Q ? "bg-green-400" : i === phase1Q ? "bg-indigo-500" : "bg-gray-200"}`} />)}
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 mb-1">{p1q.title}</h3>
                    <p className="text-sm text-gray-500 mb-4">{p1q.subtitle}</p>
                    {!canAnswer ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center"><p className="text-5xl mb-3 animate-pulse">🤔</p><p className="text-2xl font-bold text-indigo-600">{thinkLeft}</p><p className="text-sm text-gray-400 mt-1">秒后可以作答</p></div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {p1q.options.map((opt) => {
                          const sel = (phase1Answers[p1q.id] || []).includes(opt.label);
                          return (
                            <button key={opt.label} onClick={() => toggleP1Option(p1q.id, opt.label, p1q.multi)}
                              className={`w-full text-left p-3 rounded-xl border-2 transition text-sm ${sel ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <span className={`text-xs ${p1HasAnswered ? "text-green-500" : "text-gray-300"}`}>{p1HasAnswered ? "✓ 已作答" : "○ 请选择"}</span>
                      {canAnswer && (
                        <div className="flex gap-2">
                          {p1IsLast ? (
                            <button onClick={startPhase2} disabled={!p1Done} className="bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-2 rounded-xl text-sm font-medium transition">✅ 提交 → 改游戏</button>
                          ) : (
                            <button onClick={() => goPhase1Q(phase1Q + 1)} disabled={!p1HasAnswered} className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-2 rounded-xl text-sm font-medium transition">下一题 →</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 阶段二：小智老师陪你改游戏 */}
            {phase === "phase2" && p2round && (
              <div className="flex flex-col h-full">
                <div className="flex gap-2 mb-4">
                  {PHASE2_ROUNDS.map((_, i) => <div key={i} className={`flex-1 h-2 rounded-full ${i < phase2Round ? "bg-green-400" : i === phase2Round ? "bg-amber-500" : "bg-gray-200"}`} />)}
                </div>
                <div className="flex-1 flex flex-col">
                  {playerNameChoice === "custom" ? (
                    /* 自定义名字输入 */
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col items-center justify-center space-y-4">
                      <p className="text-4xl">✏️</p>
                      <p className="text-lg font-bold text-gray-800">给你的游戏取个名字！</p>
                      <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitCustomName()}
                        placeholder="输入游戏名字..." className="w-full max-w-xs px-4 py-3 text-lg border-2 border-indigo-200 rounded-xl outline-none focus:border-indigo-400 text-center" autoFocus />
                      <button onClick={submitCustomName} disabled={!customName.trim()} className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 text-white px-8 py-3 rounded-xl text-lg font-medium transition">确定 ✓</button>
                    </div>
                  ) : (
                    <>
                      {/* 小智老师说话 */}
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 flex-shrink-0"><XiaozhiAvatar state="thinking" /></div>
                        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 flex-1">
                          <p className="text-sm text-gray-700 leading-relaxed">{p2round.teacherText}</p>
                        </div>
                      </div>

                      {/* 选项 */}
                      <div className="space-y-2 mb-4">
                        {p2round.options.map((opt, i) => (
                          <button key={i} onClick={() => handlePhase2Choice(i)}
                            disabled={!!phase2Feedback}
                            className={`w-full text-left p-4 rounded-xl border-2 transition ${phase2Feedback ? "opacity-50 cursor-default" : "hover:border-amber-400 hover:bg-amber-50 border-gray-200"} ${phase2Choices[phase2Round] === String(i) && phase2Feedback ? "border-amber-400 bg-amber-50" : ""}`}>
                            <span className="text-2xl mr-3">{opt.emoji}</span>
                            <span className="text-base font-medium text-gray-800">{opt.label}</span>
                            {opt.desc && <span className="block text-xs text-gray-400 mt-1 ml-9">{opt.desc}</span>}
                          </button>
                        ))}
                      </div>

                      {/* 反馈 */}
                      {phase2Feedback && (
                        <div className="flex items-start gap-3 animate-fade-in">
                          <div className="w-10 h-10 flex-shrink-0"><XiaozhiAvatar state="success" /></div>
                          <div className="bg-amber-50 rounded-2xl px-4 py-3 shadow-sm border border-amber-200 flex-1">
                            <p className="text-sm text-gray-700">{phase2Feedback}</p>
                          </div>
                        </div>
                      )}

                      {/* 继续按钮 */}
                      {phase2Feedback && (
                        <div className="mt-4 text-center">
                          <button onClick={nextPhase2Round} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-medium transition">
                            {phase2Round < PHASE2_ROUNDS.length - 1 ? "继续下一轮 →" : "✅ 完成"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 完成 */}
            {phase === "done" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <p className="text-6xl">🎉</p>
                <p className="text-2xl font-bold text-gray-800">做得太棒了！</p>
                <p className="text-lg text-gray-500">接下来让我们创造属于我们自己的游戏吧！</p>
                <button onClick={onComplete} className="mt-6 bg-indigo-500 hover:bg-indigo-600 text-white px-10 py-3 rounded-2xl text-xl font-bold transition">🚀 开始创作</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
