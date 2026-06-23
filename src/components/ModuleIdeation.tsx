"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";
import XiaozhiAvatar from "@/components/XiaozhiAvatar";
import { isRandomInput } from "@/utils/inputValidation";
import { validateGameName } from "@/lib/profanity";

// 素材库定义（每个分类80个）
// 素材库定义（每个分类80个，全部使用 Unicode 6.0-9.0 高兼容性emoji）
const MATERIALS = {
  role: [
    // 1-20: 人物角色
    { emoji: "🏃", label: "勇士" }, { emoji: "👸", label: "公主" }, { emoji: "🤴", label: "国王" },
    { emoji: "🧙", label: "法师" }, { emoji: "🤸", label: "弓箭手" }, { emoji: "🤼", label: "忍者" },
    { emoji: "🤖", label: "机器人" }, { emoji: "👨‍🚀", label: "宇航员" }, { emoji: "👷", label: "工人" },
    { emoji: "👮", label: "警察" }, { emoji: "👨‍⚕️", label: "医生" }, { emoji: "👨‍🍳", label: "厨师" },
    { emoji: "🤠", label: "牛仔" }, { emoji: "🤡", label: "小丑" }, { emoji: "🎅", label: "圣诞老人" },
    { emoji: "💃", label: "舞者" }, { emoji: "🕺", label: "舞者" }, { emoji: "🦸", label: "超人" },
    { emoji: "🦹", label: "反派" }, { emoji: "👼", label: "天使" },
    // 21-40: 哺乳动物
    { emoji: "🐻", label: "熊" }, { emoji: "🦁", label: "狮子" }, { emoji: "🐯", label: "老虎" },
    { emoji: "🐺", label: "狼" }, { emoji: "🦊", label: "狐狸" }, { emoji: "🐼", label: "熊猫" },
    { emoji: "🐨", label: "考拉" }, { emoji: "🐵", label: "猴子" }, { emoji: "🦍", label: "大猩猩" },
    { emoji: "🐘", label: "大象" }, { emoji: "🦒", label: "长颈鹿" }, { emoji: "🦓", label: "斑马" },
    { emoji: "🐴", label: "马" }, { emoji: "🐎", label: "赛马" }, { emoji: "🐄", label: "牛" },
    { emoji: "🐑", label: "羊" }, { emoji: "🐐", label: "山羊" }, { emoji: "🐖", label: "猪" },
    { emoji: "🐕", label: "狗" }, { emoji: "🐈", label: "猫" },
    // 41-60: 小动物/两栖
    { emoji: "🐰", label: "兔子" }, { emoji: "🐹", label: "仓鼠" }, { emoji: "🐀", label: "老鼠" },
    { emoji: "🐿️", label: "松鼠" }, { emoji: "🦇", label: "蝙蝠" }, { emoji: "🐸", label: "青蛙" },
    { emoji: "🐢", label: "乌龟" }, { emoji: "🐍", label: "蛇" }, { emoji: "🐊", label: "鳄鱼" },
    { emoji: "🦎", label: "蜥蜴" }, { emoji: "🐉", label: "龙" }, { emoji: "🦄", label: "独角兽" },
    { emoji: "🦅", label: "鹰" }, { emoji: "🦉", label: "猫头鹰" }, { emoji: "🐧", label: "企鹅" },
    { emoji: "🐓", label: "公鸡" }, { emoji: "🦆", label: "鸭子" }, { emoji: "🦢", label: "天鹅" },
    { emoji: "🐝", label: "蜜蜂" }, { emoji: "🦋", label: "蝴蝶" },
    // 61-80: 海洋/昆虫/幻想
    { emoji: "🦈", label: "鲨鱼" }, { emoji: "🐋", label: "鲸鱼" }, { emoji: "🐬", label: "海豚" },
    { emoji: "🐙", label: "章鱼" }, { emoji: "🦀", label: "螃蟹" }, { emoji: "🐟", label: "鱼" },
    { emoji: "🐠", label: "热带鱼" }, { emoji: "🐚", label: "贝壳" }, { emoji: "🐜", label: "蚂蚁" },
    { emoji: "🕷️", label: "蜘蛛" }, { emoji: "🐌", label: "蜗牛" }, { emoji: "🐛", label: "虫子" },
    { emoji: "👻", label: "幽灵" }, { emoji: "💀", label: "骷髅" }, { emoji: "👽", label: "外星人" },
    { emoji: "⛄", label: "雪人" }, { emoji: "🗿", label: "石像" }, { emoji: "🔥", label: "火元素" },
    { emoji: "👹", label: "鬼怪" }, { emoji: "🎃", label: "南瓜怪" },
  ],
  bg: [
    // 1-12: 自然天空背景（渐变色）
    { label: "蓝天", bg: "linear-gradient(180deg, #87CEEB 0%, #E0F0FF 100%)" },
    { label: "晴天", bg: "linear-gradient(180deg, #4A90D9 0%, #87CEEB 50%, #E0F0FF 100%)" },
    { label: "多云", bg: "linear-gradient(180deg, #B0C4DE 0%, #D3D3D3 100%)" },
    { label: "雨天", bg: "linear-gradient(180deg, #708090 0%, #A9A9A9 100%)" },
    { label: "夜晚", bg: "linear-gradient(180deg, #0C1445 0%, #1A237E 50%, #283593 100%)" },
    { label: "星空", bg: "linear-gradient(180deg, #000033 0%, #0D1B2A 50%, #1B2838 100%)" },
    { label: "日落", bg: "linear-gradient(180deg, #FF6B35 0%, #F7931E 30%, #FFD700 60%, #87CEEB 100%)" },
    { label: "日出", bg: "linear-gradient(180deg, #FFB347 0%, #FFCC33 30%, #87CEEB 100%)" },
    { label: "银河", bg: "linear-gradient(180deg, #0C0C1E 0%, #1A1A3E 50%, #2D2D5E 100%)" },
    { label: "黄昏", bg: "linear-gradient(180deg, #FF7E5F 0%, #FEB47B 50%, #FFD89B 100%)" },
    { label: "极光", bg: "linear-gradient(180deg, #0C1445 0%, #11998e 30%, #38ef7d 60%, #0C1445 100%)" },
    { label: "暴风", bg: "linear-gradient(180deg, #2C3E50 0%, #4CA1AF 100%)" },
    // 13-24: 地形地貌背景
    { label: "草地", bg: "linear-gradient(180deg, #87CEEB 0%, #87CEEB 40%, #4CAF50 40%, #2E7D32 100%)" },
    { label: "森林", bg: "linear-gradient(180deg, #2D5016 0%, #1B5E20 50%, #2E7D32 100%)" },
    { label: "沙漠", bg: "linear-gradient(180deg, #F5DEB3 0%, #DEB887 50%, #D2B48C 100%)" },
    { label: "雪地", bg: "linear-gradient(180deg, #E8E8E8 0%, #F5F5F5 50%, #FFFFFF 100%)" },
    { label: "海洋", bg: "linear-gradient(180deg, #87CEEB 0%, #4682B4 50%, #2E5090 100%)" },
    { label: "火山", bg: "linear-gradient(180deg, #1A1A1A 0%, #8B0000 50%, #FF4500 100%)" },
    { label: "冰川", bg: "linear-gradient(180deg, #B0E0E6 0%, #ADD8E6 50%, #E0FFFF 100%)" },
    { label: "岩洞", bg: "linear-gradient(180deg, #2F2F2F 0%, #4A4A4A 50%, #696969 100%)" },
    { label: "丛林", bg: "linear-gradient(180deg, #228B22 0%, #006400 50%, #228B22 100%)" },
    { label: "荒原", bg: "linear-gradient(180deg, #C4A882 0%, #A0826E 50%, #8B7355 100%)" },
    { label: "海底", bg: "linear-gradient(180deg, #006994 0%, #004E6A 50%, #003344 100%)" },
    { label: "太空", bg: "linear-gradient(180deg, #000000 0%, #0D1117 50%, #161B22 100%)" },
    // 25-36: 场景背景
    { label: "城市", bg: "linear-gradient(180deg, #87CEEB 0%, #87CEEB 30%, #708090 30%, #556B7A 100%)" },
    { label: "城堡", bg: "linear-gradient(180deg, #87CEEB 0%, #87CEEB 35%, #808080 35%, #696969 100%)" },
    { label: "村庄", bg: "linear-gradient(180deg, #87CEEB 0%, #87CEEB 35%, #4CAF50 35%, #388E3C 100%)" },
    { label: "地牢", bg: "linear-gradient(180deg, #1A1A1A 0%, #2D2D2D 50%, #404040 100%)" },
    { label: "竞技场", bg: "linear-gradient(180deg, #87CEEB 0%, #87CEEB 30%, #CD853F 30%, #8B6914 100%)" },
    { label: "太空站", bg: "linear-gradient(180deg, #000000 0%, #1A1A2E 50%, #30305A 100%)" },
    { label: "迷宫", bg: "linear-gradient(180deg, #2F4F4F 0%, #3C5C5C 50%, #4A6A6A 100%)" },
    { label: "糖果世界", bg: "linear-gradient(180deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%)" },
    { label: "彩虹", bg: "linear-gradient(180deg, #FF0000 0%, #FF7F00 20%, #FFFF00 40%, #00FF00 60%, #0000FF 80%, #8B00FF 100%)" },
    { label: "废墟", bg: "linear-gradient(180deg, #A0A0A0 0%, #808080 50%, #606060 100%)" },
    { label: "矿山", bg: "linear-gradient(180deg, #4A4A4A 0%, #6B6B6B 50%, #8C8C8C 100%)" },
    { label: "云端", bg: "linear-gradient(180deg, #E6F3FF 0%, #FFFFFF 50%, #F0F8FF 100%)" },
  ],
  prop: [
    // 1-20: 武器装备
    { emoji: "🗡️", label: "剑" }, { emoji: "⚔️", label: "双剑" }, { emoji: "🔪", label: "匕首" },
    { emoji: "🏹", label: "弓" }, { emoji: "🔨", label: "锤子" }, { emoji: "⛏️", label: "镐" },
    { emoji: "🔱", label: "三叉戟" }, { emoji: "🎣", label: "鱼竿" }, { emoji: "🛡️", label: "盾牌" },
    { emoji: "🎯", label: "靶子" }, { emoji: "💣", label: "炸弹" }, { emoji: "🧨", label: "炸药" },
    { emoji: "🔫", label: "水枪" }, { emoji: "🏏", label: "球棒" }, { emoji: "⚾", label: "棒球" },
    { emoji: "🥊", label: "拳套" }, { emoji: "🤺", label: "击剑" }, { emoji: "🎿", label: "滑雪" },
    { emoji: "🛷", label: "雪橇" }, { emoji: "🥏", label: "飞盘" },
    // 21-40: 宝物收藏
    { emoji: "💰", label: "金币" }, { emoji: "💎", label: "钻石" }, { emoji: "👑", label: "皇冠" },
    { emoji: "💍", label: "戒指" }, { emoji: "📿", label: "项链" }, { emoji: "🏆", label: "奖杯" },
    { emoji: "🎁", label: "宝箱" }, { emoji: "🔑", label: "钥匙" }, { emoji: "🗝️", label: "古钥匙" },
    { emoji: "🔮", label: "水晶球" }, { emoji: "🧪", label: "药水" }, { emoji: "⚗️", label: "炼金瓶" },
    { emoji: "📜", label: "卷轴" }, { emoji: "📕", label: "魔法书" }, { emoji: "🃏", label: "卡牌" },
    { emoji: "🎲", label: "骰子" }, { emoji: "⏳", label: "沙漏" }, { emoji: "🧭", label: "指南针" },
    { emoji: "🔭", label: "望远镜" }, { emoji: "📡", label: "信号塔" },
    // 41-60: 食物补给
    { emoji: "🍎", label: "苹果" }, { emoji: "🍖", label: "肉" }, { emoji: "🍞", label: "面包" },
    { emoji: "🧀", label: "奶酪" }, { emoji: "🐟", label: "鱼" }, { emoji: "🍄", label: "蘑菇" },
    { emoji: "🥕", label: "胡萝卜" }, { emoji: "🌽", label: "玉米" }, { emoji: "🍕", label: "披萨" },
    { emoji: "🍔", label: "汉堡" }, { emoji: "🌮", label: "卷饼" }, { emoji: "🍩", label: "甜甜圈" },
    { emoji: "🎂", label: "蛋糕" }, { emoji: "🍪", label: "饼干" }, { emoji: "🍫", label: "巧克力" },
    { emoji: "🍬", label: "糖果" }, { emoji: "🍭", label: "棒棒糖" }, { emoji: "☕", label: "咖啡" },
    { emoji: "🧃", label: "果汁" }, { emoji: "💧", label: "水瓶" },
    // 61-80: 工具/装饰
    { emoji: "❤️", label: "爱心" }, { emoji: "⭐", label: "星星" }, { emoji: "🌟", label: "闪星" },
    { emoji: "✨", label: "光效" }, { emoji: "💥", label: "爆炸" }, { emoji: "💫", label: "旋转" },
    { emoji: "🔔", label: "铃铛" }, { emoji: "🎵", label: "音符" }, { emoji: "🎸", label: "吉他" },
    { emoji: "🥁", label: "鼓" }, { emoji: "🎺", label: "号角" }, { emoji: "🚩", label: "旗帜" },
    { emoji: "🏮", label: "灯笼" }, { emoji: "🔥", label: "火把" }, { emoji: "🕯️", label: "蜡烛" },
    { emoji: "🧶", label: "绳子" }, { emoji: "📎", label: "夹子" }, { emoji: "🧲", label: "磁铁" },
    { emoji: "⚙️", label: "齿轮" }, { emoji: "🎮", label: "手柄" },
  ],
};

const RULE_HINTS = [
  "如果拿到星星就过关",
  "如果碰到陷阱就掉血",
];

const COLORS = ["#000000", "#FF0000", "#00AA00", "#0000FF", "#FF9900", "#9900FF", "#FF6699", "#00CCCC"];

interface CanvasItem { emoji: string; x: number; y: number; size: number; }
interface DrawPoint { x: number; y: number; }
interface DrawStroke { color: string; size: number; points: DrawPoint[]; }

interface Props { userId: string; }

export default function ModuleIdeation({ userId }: Props) {
  const [surveyDone, setSurveyDone] = useState(false);
  const [q1, setQ1] = useState(""); const [q2, setQ2] = useState(""); const [q3, setQ3] = useState("");
  const [q4, setQ4] = useState(""); const [q5, setQ5] = useState("");

  const [gameType, setGameType] = useState("");
  const [customType, setCustomType] = useState("");
  const [rules, setRules] = useState(["", "", ""]);
  const [gameName, setGameName] = useState("");
  const [designDone, setDesignDone] = useState(false);

  // 画布状态
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const currentStrokeRef = useRef<DrawPoint[]>([]);
  const [dragging, setDragging] = useState<{ index: number; offsetX: number; offsetY: number } | null>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const [materialTab, setMaterialTab] = useState<"role" | "bg" | "prop">("role");
  const [drawTime, setDrawTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedDesignImage, setSavedDesignImage] = useState<string | null>(null);
  const [canvasBg, setCanvasBg] = useState<string>("#FFFFFF"); // 画布背景色
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef<number>(0);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 撤销/重做历史
  const [history, setHistory] = useState<{ items: CanvasItem[]; strokes: DrawStroke[]; bg: string }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  const [currentPhase, setCurrentPhase] = useState<"survey" | "design">("survey");
  const [aiChatMessages, setAiChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [imageHistory, setImageHistory] = useState<{ url: string; prompt: string }[]>([]);
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number>(-1);
  const aiChatEndRef = useRef<HTMLDivElement>(null);

  const CW = 800;
  const CH = 600;

  // 加载已有数据（并行请求）
  useEffect(() => {
    const loadExistingData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token; if (!token) return;

        // 并行加载基础情况和设计数据
        const [surveyRes, designRes] = await Promise.all([
          fetch("/api/student/tasks?task_id=survey", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/student/tasks?task_id=1-1", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (surveyRes.ok) {
          const surveyData = await surveyRes.json();
          if (surveyData.length > 0 && surveyData[0].design_reason) {
            try {
              const answers = JSON.parse(surveyData[0].design_reason);
              if (answers.q1) setQ1(answers.q1);
              if (answers.q2) setQ2(answers.q2);
              if (answers.q3) setQ3(answers.q3);
              if (answers.q4) setQ4(answers.q4);
              if (answers.q5) setQ5(answers.q5);
              setSurveyDone(true);
            } catch (err) { console.error(err); }
          }
        }

        // 加载设计数据
        if (designRes.ok) {
          const designData = await designRes.json();
          if (designData.length > 0) {
            const task = designData[0];
            if (task.game_name) setGameName(task.game_name);
            if (task.game_rules && task.game_rules.length > 0) {
              const r = task.game_rules;
              setRules([r[0] || "", r[1] || "", r[2] || ""]);
            }
            if (task.design_reason) {
              try {
                const info = JSON.parse(task.design_reason);
                if (info.game_type) {
                  const predefined = ["接东西", "躲避", "跑酷", "迷宫", "对战"];
                  if (predefined.includes(info.game_type)) setGameType(info.game_type);
                  else { setGameType("其他"); setCustomType(info.game_type); }
                }
                if (info.ai_prompt) {
                  setAiChatMessages([
                    { role: "user", content: info.ai_prompt },
                    { role: "assistant", content: "已为你生成游戏画面，可在右侧查看。如需修改，请继续描述。" },
                  ]);
                }
                if (info.image_history && info.image_history.length > 0) {
                  setImageHistory(info.image_history);
                  setSelectedHistoryIdx(info.image_history.length - 1);
                  setSavedDesignImage(info.image_history[info.image_history.length - 1].url);
                }
              } catch {
                const typeMatch = task.design_reason.match(/游戏类型：(.+)/);
                if (typeMatch) {
                  const type = typeMatch[1];
                  const predefined = ["接东西", "躲避", "跑酷", "迷宫", "对战"];
                  if (predefined.includes(type)) setGameType(type);
                  else { setGameType("其他"); setCustomType(type); }
                }
              }
            }
            // 从 design_image 字段加载图片（兼容旧数据）
            if (task.design_image) {
              if (!savedDesignImage) {
                setSavedDesignImage(task.design_image);
              }
              // 如果 imageHistory 为空，将 design_image 加入历史
              if (imageHistory.length === 0 && task.design_image.startsWith("data:")) {
                setImageHistory([{ url: task.design_image, prompt: "设计图" }]);
                setSelectedHistoryIdx(0);
              }
            }
            if (task.duration_seconds) setDrawTime(task.duration_seconds);
            setDesignDone(true);
            setCurrentPhase("design");
          }
        }
      } catch (err) { console.error(err); }
    };
    loadExistingData();
  }, []);

  // 计时器
  useEffect(() => {
    if (currentPhase === "design") {
      timerRef.current = setInterval(() => setDrawTime((t) => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentPhase]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const getPos = (e: React.MouseEvent): DrawPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (CW / rect.width), y: (e.clientY - rect.top) * (CH / rect.height) };
  };

  // 重绘画布（所有内容在同一张画布上）
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = 2;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    ctx.scale(dpr, dpr);

    // 清空画布（透明背景，由CSS gradient提供背景）
    ctx.clearRect(0, 0, CW, CH);

    // 绘制笔画
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      ctx.stroke();
    }

    // 绘制当前正在画的笔画
    const cs = currentStrokeRef.current;
    if (cs.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < cs.length; i++) ctx.lineTo(cs[i].x, cs[i].y);
      ctx.stroke();
    }

    // 绘制素材（在笔画之上）
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const item of items) {
      ctx.font = `${item.size}px serif`;
      ctx.fillText(item.emoji, item.x, item.y);
    }

    // 如果有保存的设计图且没有新内容，绘制设计图
    if (savedDesignImage && strokes.length === 0 && items.length === 0 && cs.length === 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, CW, CH);
      };
      img.src = savedDesignImage;
    }
  }, [strokes, brushColor, brushSize, items, savedDesignImage]);

  useEffect(() => { redrawAll(); }, [redrawAll]);

  // 页面关闭前保存绘画
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentPhase === "design" && (items.length > 0 || strokes.length > 0)) {
        // 同步保存（使用 sendBeacon）
        const canvas = canvasRef.current;
        if (canvas) {
          const imageData = canvas.toDataURL("image/png");
          navigator.sendBeacon("/api/student/tasks", JSON.stringify({
            task_id: "1-1",
            design_image: imageData,
            game_rules: rules.filter((r) => r.trim()),
            game_name: gameName,
            design_reason: `游戏类型：${gameType || customType}`,
            duration_seconds: drawTime,
          }));
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentPhase, items, strokes, rules, gameName, gameType, customType, drawTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPos(e);
    if (mode === "move") {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (Math.abs(pos.x - item.x) < item.size / 2 && Math.abs(pos.y - item.y) < item.size / 2) {
          setDragging({ index: i, offsetX: pos.x - item.x, offsetY: pos.y - item.y });
          return;
        }
      }
    } else {
      currentStrokeRef.current = [pos];
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPos(e);
    if (mode === "move" && dragging) {
      const newItems = [...items];
      newItems[dragging.index] = { ...newItems[dragging.index], x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY };
      setItems(newItems);
    } else if (mode === "draw" && currentStrokeRef.current.length > 0) {
      currentStrokeRef.current = [...currentStrokeRef.current, pos];
      redrawAll(); // 直接重绘，不触发 setState
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mode === "move" && dragging) {
      // 检查鼠标是否在垃圾桶区域释放
      if (trashRef.current) {
        const trashRect = trashRef.current.getBoundingClientRect();
        const isOver = e.clientX >= trashRect.left && e.clientX <= trashRect.right &&
                       e.clientY >= trashRect.top && e.clientY <= trashRect.bottom;
        if (isOver) {
          saveToHistory();
          setItems((prev) => prev.filter((_, i) => i !== dragging.index));
        }
      }
      setDragging(null);
    } else if (mode === "draw" && currentStrokeRef.current.length > 0) {
      saveToHistory();
      setStrokes((prev) => [...prev, { color: brushColor, size: brushSize, points: currentStrokeRef.current }]);
      currentStrokeRef.current = [];
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.type === "bg" && data.bg) {
        // 背景素材：改变画布背景
        saveToHistory();
        setCanvasBg(data.bg);
      } else if (data.emoji) {
        // 角色/道具素材：添加到画布
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (CW / rect.width);
        const y = (e.clientY - rect.top) * (CH / rect.height);
        saveToHistory();
        setItems((prev) => [...prev, { emoji: data.emoji, x, y, size: data.size || 40 }]);
      }
    } catch (err) { console.error(err); }
  };

  const clearCanvas = () => {
    // 保存当前状态到历史
    saveToHistory();
    setItems([]);
    setStrokes([]);
    currentStrokeRef.current = [];
  };

  // 保存当前状态到历史
  const saveToHistory = useCallback(() => {
    setHistory((prev) => {
      const idx = historyIndexRef.current;
      const newHistory = prev.slice(0, idx + 1);
      newHistory.push({ items: [...items], strokes: [...strokes], bg: canvasBg });
      return newHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [items, strokes, canvasBg]);

  // 撤销
  const handleUndo = () => {
    if (historyIndex < 0) return;
    const state = history[historyIndex];
    setItems(state.items);
    setStrokes(state.strokes);
    setCanvasBg(state.bg);
    setHistoryIndex((prev) => prev - 1);
  };

  // 重做
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const state = history[historyIndex + 1];
    setItems(state.items);
    setStrokes(state.strokes);
    setCanvasBg(state.bg);
    setHistoryIndex((prev) => prev + 1);
  };

  // 自动保存绘画数据（防抖，3秒内变化只保存一次）
  const autoSaveDrawing = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token; if (!token) return;
        const drawCanvas = canvasRef.current;
        const imageData = drawCanvas ? drawCanvas.toDataURL("image/png") : "";
        const lastAiPrompt = aiChatMessages.filter(m => m.role === "user").pop()?.content || "";
        await fetch("/api/student/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            task_id: "1-1",
            design_image: imageData,
            game_rules: rules.filter((r) => r.trim()),
            game_name: gameName,
            design_reason: JSON.stringify({
              game_type: gameType || customType,
              ai_prompt: lastAiPrompt,
              image_history: imageHistory.map(h => ({ prompt: h.prompt, url: h.url })),
            }),
            duration_seconds: drawTime,
          }),
        });
        lastSaveRef.current = Date.now();
      } catch (err) { console.error(err); } finally {
        setIsSaving(false);
      }
    }, 3000);
  }, [rules, gameName, gameType, customType, drawTime]);

  // 当画布内容变化时自动保存
  useEffect(() => {
    if (currentPhase === "design" && (items.length > 0 || strokes.length > 0)) {
      autoSaveDrawing();
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [items, strokes, currentPhase, autoSaveDrawing]);

  const saveDesign = async () => {
    // 验证游戏名称
    const nameValidation = validateGameName(gameName);
    if (!nameValidation.valid) {
      alert(nameValidation.error);
      return;
    }

    // 验证规则
    const validRules = rules.filter((r) => r.trim());
    if (validRules.length === 0) {
      alert("请至少写一条游戏规则！");
      return;
    }
    for (const rule of validRules) {
      if (isRandomInput(rule)) {
        alert("请认真填写游戏规则，不要乱打键盘哦～");
        return;
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      // 优先使用AI生成的图片，避免canvas导出慢
      let imageData = savedDesignImage || "";
      if (!imageData) {
        const drawCanvas = canvasRef.current;
        if (drawCanvas && (strokes.length > 0 || items.length > 0)) {
          imageData = drawCanvas.toDataURL("image/png");
        }
      }
      const lastAiPrompt = aiChatMessages.filter(m => m.role === "user").pop()?.content || "";
      await fetch("/api/student/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          task_id: "1-1",
          design_image: imageData,
          game_rules: validRules,
          game_name: gameName,
          design_reason: JSON.stringify({
            game_type: gameType || customType,
            ai_prompt: lastAiPrompt,
            image_history: imageHistory.map(h => ({ prompt: h.prompt, url: h.url })),
          }),
          duration_seconds: drawTime,
        }),
      });
      setDesignDone(true);
      // 直接传递设计数据到游戏设计模块（避免重新从数据库加载）
      const designPayload = {
        game_name: gameName,
        game_rules: validRules,
        design_reason: JSON.stringify({
          game_type: gameType || customType,
          ai_prompt: lastAiPrompt,
          image_history: imageHistory.map(h => ({ prompt: h.prompt, url: h.url })),
        }),
        design_image: imageData,
      };
      localStorage.setItem("designData", JSON.stringify(designPayload));
      localStorage.setItem("gotoModule", "create");
      window.location.href = "/student?module=create";
    } catch { alert("保存失败"); }
  };

  // AI生图（结合规则和对话历史）
  const generateImage = async (prompt: string) => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;

      // 将规则融入提示词
      const validRules = rules.filter((r) => r.trim());
      const rulesText = validRules.length > 0
        ? "游戏规则：" + validRules.map((r) => `如果${r}`).join("，") + "。"
        : "";
      const fullPrompt = `${prompt.trim()}。${rulesText}这是2D网页游戏的画面，扁平化卡通风格，色彩明快，适合儿童。`;

      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: fullPrompt }),
      });
      const data = await res.json();
      if (res.ok && data.image) {
        setSavedDesignImage(data.image);
        setImageHistory((prev) => [...prev, { url: data.image, prompt }]);
        setSelectedHistoryIdx(imageHistory.length);

        // 自动保存到数据库
        try {
          await fetch("/api/student/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              task_id: "1-1",
              design_image: data.image,
              game_rules: rules.filter((r) => r.trim()),
              game_name: gameName,
              design_reason: JSON.stringify({
                game_type: gameType || customType,
                ai_prompt: prompt,
                image_history: [...imageHistory, { url: data.image, prompt }],
              }),
              duration_seconds: drawTime,
            }),
          });
        } catch (err) { console.error(err); }
      } else {
        setAiChatMessages((prev) => [...prev, { role: "assistant", content: `生成失败：${data.error || "请重试"}` }]);
      }
    } catch (e: any) {
      setAiChatMessages((prev) => [...prev, { role: "assistant", content: `生成失败：${e.message}` }]);
    } finally {
      setGenerating(false);
    }
  };

  // AI对话生图
  const handleAiChatSend = async () => {
    if (!aiChatInput.trim() || generating) return;
    const userMsg = aiChatInput.trim();
    setAiChatInput("");
    setAiChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    await generateImage(userMsg);
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* 阶段指示器 */}
      <div className="flex items-center gap-3 mb-3">
        {[{ id: "survey", label: "基础情况", icon: " " }, { id: "design", label: "个人设计", icon: "✏️" }].map((phase, i) => (
          <div key={phase.id} className="flex items-center gap-2">
            <button onClick={() => { if (phase.id === "survey") setCurrentPhase("survey"); if (phase.id === "design" && surveyDone) setCurrentPhase("design"); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${currentPhase === phase.id ? "bg-indigo-500 text-white shadow-md" : "bg-white text-gray-500"}`}>{phase.icon} {phase.label}</button>
            {i < 1 && <div className="w-6 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* ========== 基础情况 ========== */}
      {currentPhase === "survey" && (
        <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex flex-col justify-between">
          {/* 小智老师提示 */}
          <div className="flex items-start gap-3 mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="w-12 h-12 flex-shrink-0"><XiaozhiAvatar state="idle" /></div>
            <div>
              <p className="text-sm font-bold text-indigo-700">小智老师</p>
              <p className="text-xs text-indigo-600">同学你好！先回答几个小问题，帮助我了解你～</p>
            </div>
          </div>
          <div className="space-y-4">
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">1. 你平时玩过游戏吗？</label><div className="flex gap-2"><input value={q1} onChange={(e) => setQ1(e.target.value)} placeholder="比如：经常玩、偶尔玩、没怎么玩过..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ1(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">2. 你玩过哪些游戏？最喜欢哪个？</label><div className="flex gap-2"><input value={q2} onChange={(e) => setQ2(e.target.value)} placeholder="比如：我的世界、王者荣耀、植物大战僵尸..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ2(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">3. 你接触过编程吗？</label><div className="flex gap-2"><input value={q3} onChange={(e) => setQ3(e.target.value)} placeholder="比如：学过Scratch、完全没接触过..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ3(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">4. 你有没有自己设计过游戏或者编过故事？</label><div className="flex gap-2"><input value={q4} onChange={(e) => setQ4(e.target.value)} placeholder="比如：用Scratch做过小游戏、编过冒险故事..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ4(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">5. 你觉得做一个好游戏最重要的是什么？</label><div className="flex gap-2"><input value={q5} onChange={(e) => setQ5(e.target.value)} placeholder="比如：好玩、画面好看、有挑战性、能和朋友一起玩..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ5(text)} /></div></div>
          </div>
          <button onClick={async () => {
            // 检查哪些没填
            const missing: string[] = [];
            if (!q1.trim()) missing.push("第1题");
            if (!q2.trim()) missing.push("第2题");
            if (!q3.trim()) missing.push("第3题");
            if (!q4.trim()) missing.push("第4题");
            if (!q5.trim()) missing.push("第5题");
            if (missing.length > 0) {
              alert(`请先填写：${missing.join("、")}`);
              return;
            }
            // 保存基础情况数据
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (token) {
                await fetch("/api/student/tasks", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({
                    task_id: "survey",
                    design_reason: JSON.stringify({ q1: q1.trim(), q2: q2.trim(), q3: q3.trim(), q4: q4.trim(), q5: q5.trim() }),
                  }),
                });
              }
            } catch (err) { console.error(err); }
            setSurveyDone(true);
            setCurrentPhase("design");
          }} className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-base font-medium transition mt-4">提交并进入设计 →</button>
        </div>
      )}

      {/* ========== 个人设计 ========== */}
      {currentPhase === "design" && (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* 左侧：规则 + AI对话 */}
          <div className="w-96 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden">
            {/* 游戏名称 + 规则 */}
            <div className="p-4 border-b border-gray-100">
              <div className="mb-3">
                <label className="text-base font-bold text-gray-800 mb-1.5 block">  游戏名称</label>
                <div className="flex gap-2">
                  <input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="给游戏取个名字！" className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" />
                  <VoiceButton onResult={(text) => setGameName((prev) => prev + text)} />
                </div>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-2">  游戏规则</h3>
              {rules.map((rule, i) => (
                <div key={i} className="mb-2">
                  <div className="flex gap-2">
                    <input value={rule} onChange={(e) => { const nr = [...rules]; nr[i] = e.target.value; setRules(nr); }} placeholder="如果...就..." className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 outline-none" />
                    <VoiceButton onResult={(text) => { const nr = [...rules]; nr[i] = text; setRules(nr); }} size="sm" />
                  </div>
                </div>
              ))}
            </div>

            {/* AI对话生图 */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-gray-100 bg-purple-50 flex items-center gap-2">
                <div className="w-8 h-8 flex-shrink-0"><XiaozhiAvatar state={generating ? "thinking" : "idle"} /></div>
                <div>
                  <h3 className="text-sm font-bold text-purple-700">  AI生图助手</h3>
                  <p className="text-[10px] text-purple-500">描述游戏画面，AI帮你生成图片</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {aiChatMessages.length === 0 && (
                  <div className="text-center text-gray-400 py-6">
                    <p className="text-3xl mb-2"> </p>
                    <p className="text-sm">描述你想要的游戏画面</p>
                  </div>
                )}
                {aiChatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.role === "user" ? "bg-purple-500 text-white rounded-br-md" : "bg-gray-100 text-gray-700 rounded-bl-md"}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {generating && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm"><span className="animate-pulse">  生成中...</span></div>
                  </div>
                )}
                <div ref={aiChatEndRef} />
              </div>
              <div className="p-3 border-t border-gray-100">
                <div className="flex gap-2">
                  <input value={aiChatInput} onChange={(e) => setAiChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAiChatSend()} placeholder="描述游戏画面..." className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 outline-none" disabled={generating} />
                  <VoiceButton onResult={(text) => setAiChatInput(text)} size="sm" />
                  <button onClick={handleAiChatSend} disabled={generating || !aiChatInput.trim()} className="px-4 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-200 text-white rounded-xl text-sm font-bold">生成</button>
                </div>
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="p-3 border-t border-gray-100">
              <button onClick={saveDesign} disabled={!gameName.trim()} className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-sm font-bold transition">
                保存并进入游戏设计 →
              </button>
            </div>
          </div>

          {/* 右侧：AI生图结果 + 历史版本 */}
          <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-base font-bold text-gray-800">  游戏画面</h3>
            </div>
            {/* 图片区域 */}
            <div className="flex-1 p-4 flex items-center justify-center min-h-0">
              {savedDesignImage ? (
                <img
                  src={savedDesignImage}
                  alt="AI生成的游戏画面"
                  className="max-w-full max-h-full rounded-xl border border-gray-200 shadow-sm object-contain"
                  onError={(e) => {
                    // 图片加载失败时显示占位提示
                    (e.target as HTMLImageElement).style.display = "none";
                    setSavedDesignImage(null);
                  }}
                />
              ) : (
                <div className="text-center text-gray-400">
                  <p className="text-5xl mb-3"> </p>
                  <p className="text-base font-medium">在左侧描述你的游戏</p>
                  <p className="text-xs mt-2">AI会为你生成游戏画面</p>
                </div>
              )}
            </div>
            {/* 历史版本 */}
            {imageHistory.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <h4 className="text-xs font-bold text-gray-600 mb-2">  历史版本</h4>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {imageHistory.map((img, i) => (
                    <button key={i} onClick={() => { setSelectedHistoryIdx(i); setSavedDesignImage(img.url); }}
                      className={`flex-shrink-0 w-20 h-14 rounded-lg border-2 overflow-hidden transition ${selectedHistoryIdx === i ? "border-purple-500 ring-2 ring-purple-300" : "border-gray-200 hover:border-purple-300"}`}>
                      <img
                        src={img.url}
                        alt={`v${i + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // 图片加载失败时显示占位
                          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='56' fill='%23e5e7eb'%3E%3Crect width='80' height='56'/%3E%3Ctext x='40' y='28' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='10'%3E已过期%3C/text%3E%3C/svg%3E";
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
