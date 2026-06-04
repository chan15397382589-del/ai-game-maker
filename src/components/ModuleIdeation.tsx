"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import VoiceButton from "@/components/VoiceButton";

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
    // 1-20: 自然天空
    { emoji: "☁️", label: "蓝天" }, { emoji: "🌤️", label: "晴天" }, { emoji: "⛅", label: "多云" },
    { emoji: "🌧️", label: "雨天" }, { emoji: "⛈️", label: "雷雨" }, { emoji: "❄️", label: "雪天" },
    { emoji: "🌙", label: "夜晚" }, { emoji: "⭐", label: "星空" }, { emoji: "🌈", label: "彩虹" },
    { emoji: "☀️", label: "太阳" }, { emoji: "🌕", label: "满月" }, { emoji: "🌅", label: "日落" },
    { emoji: "🌄", label: "日出" }, { emoji: "🌌", label: "银河" }, { emoji: "🌍", label: "地球" },
    { emoji: "💫", label: "流星" }, { emoji: "☄️", label: "彗星" }, { emoji: "✨", label: "星光" },
    { emoji: "🌀", label: "旋风" }, { emoji: "🌪️", label: "龙卷风" },
    // 21-40: 地形地貌
    { emoji: "🌿", label: "草地" }, { emoji: "🌲", label: "森林" }, { emoji: "🌴", label: "棕榈树" },
    { emoji: "🏜️", label: "沙漠" }, { emoji: "⛰️", label: "山脉" }, { emoji: "🌋", label: "火山" },
    { emoji: "🏝️", label: "岛屿" }, { emoji: "🌊", label: "海洋" }, { emoji: "🏞️", label: "湖泊" },
    { emoji: "❄️", label: "冰川" }, { emoji: "🪨", label: "岩石" }, { emoji: "🕳️", label: "洞穴" },
    { emoji: "🌾", label: "麦田" }, { emoji: "🌵", label: "仙人掌" }, { emoji: "🍄", label: "蘑菇" },
    { emoji: "🌸", label: "樱花" }, { emoji: "🌺", label: "木槿" }, { emoji: "🌹", label: "玫瑰" },
    { emoji: "🌻", label: "向日葵" }, { emoji: "🎋", label: "竹子" },
    // 41-60: 建筑场景
    { emoji: "🏰", label: "城堡" }, { emoji: "🏯", label: "宫殿" }, { emoji: "⛪", label: "教堂" },
    { emoji: "🕌", label: "寺庙" }, { emoji: "🕋", label: "圣殿" }, { emoji: "🏙️", label: "城市" },
    { emoji: "🏘️", label: "村庄" }, { emoji: "🏚️", label: "废墟" }, { emoji: "🏗️", label: "工地" },
    { emoji: "🏠", label: "房子" }, { emoji: "🏫", label: "学校" }, { emoji: "🏥", label: "医院" },
    { emoji: "🏪", label: "商店" }, { emoji: "🏭", label: "工厂" }, { emoji: "🌉", label: "桥" },
    { emoji: "🌁", label: "雾桥" }, { emoji: "🎪", label: "马戏团" }, { emoji: "🎭", label: "剧场" },
    { emoji: "🏟️", label: "体育场" }, { emoji: "🎡", label: "摩天轮" },
    // 61-80: 特殊场景
    { emoji: "🧱", label: "砖墙" }, { emoji: "🚧", label: "栅栏" }, { emoji: "🌲", label: "木头" },
    { emoji: "⛓️", label: "地牢" }, { emoji: "🧗", label: "梯子" }, { emoji: "🚪", label: "门" },
    { emoji: "🏠", label: "窗户" }, { emoji: "🛤️", label: "铁轨" }, { emoji: "⚓", label: "港口" },
    { emoji: "🚀", label: "火箭" }, { emoji: "🛸", label: "飞碟" }, { emoji: "🛰️", label: "卫星" },
    { emoji: "🗺️", label: "地图" }, { emoji: "🧭", label: "罗盘" }, { emoji: "🔥", label: "火焰" },
    { emoji: "💧", label: "水面" }, { emoji: "💨", label: "风" }, { emoji: "⚡", label: "闪电" },
    { emoji: "🌊", label: "瀑布" }, { emoji: "🎆", label: "烟花" },
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
  const [currentStroke, setCurrentStroke] = useState<DrawPoint[]>([]);
  const [dragging, setDragging] = useState<{ index: number; offsetX: number; offsetY: number } | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [materialTab, setMaterialTab] = useState<"role" | "bg" | "prop">("role");
  const [drawTime, setDrawTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedDesignImage, setSavedDesignImage] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef<number>(0);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 撤销/重做历史
  const [history, setHistory] = useState<{ items: CanvasItem[]; strokes: DrawStroke[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 小组讨论
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberDesign, setMemberDesign] = useState<any>(null);
  const [speakingAs, setSpeakingAs] = useState<string>("me");
  const [showJoinInput, setShowJoinInput] = useState(false);

  const [currentPhase, setCurrentPhase] = useState<"survey" | "design" | "discuss">("survey");

  const CW = 800;
  const CH = 600;

  // 加载已有数据
  useEffect(() => {
    const loadExistingData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token; if (!token) return;

        // 加载基础情况数据
        const surveyRes = await fetch("/api/student/tasks?task_id=survey", { headers: { Authorization: `Bearer ${token}` } });
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
            } catch {}
          }
        }

        // 加载设计数据
        const designRes = await fetch("/api/student/tasks?task_id=1-1", { headers: { Authorization: `Bearer ${token}` } });
        if (designRes.ok) {
          const designData = await designRes.json();
          if (designData.length > 0) {
            const task = designData[0];
            if (task.game_name) setGameName(task.game_name);
            if (task.game_rules && task.game_rules.length > 0) setRules(task.game_rules);
            if (task.design_reason) {
              // 解析游戏类型
              const typeMatch = task.design_reason.match(/游戏类型：(.+)/);
              if (typeMatch) {
                const type = typeMatch[1];
                const predefined = ["接东西", "躲避", "跑酷", "迷宫", "对战"];
                if (predefined.includes(type)) {
                  setGameType(type);
                } else {
                  setGameType("其他");
                  setCustomType(type);
                }
              }
            }
            if (task.design_image) {
              // 保存设计图到状态，用于显示
              setSavedDesignImage(task.design_image);
            }
            if (task.duration_seconds) setDrawTime(task.duration_seconds);
            setDesignDone(true);
            setCurrentPhase("design");
          }
        }
      } catch {}
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

    // 白色背景
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CW, CH);

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
    if (currentStroke.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
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
    if (savedDesignImage && strokes.length === 0 && items.length === 0 && currentStroke.length === 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, CW, CH);
      };
      img.src = savedDesignImage;
    }
  }, [strokes, currentStroke, brushColor, brushSize, items, savedDesignImage]);

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
      setCurrentStroke([pos]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPos(e);
    if (mode === "move" && dragging) {
      const newItems = [...items];
      newItems[dragging.index] = { ...newItems[dragging.index], x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY };
      setItems(newItems);
    } else if (mode === "draw" && currentStroke.length > 0) {
      setCurrentStroke((prev) => [...prev, pos]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mode === "move" && dragging) {
      // 检查是否在垃圾桶区域释放
      if (isOverTrash) {
        saveToHistory();
        setItems((prev) => prev.filter((_, i) => i !== dragging.index));
      }
      setDragging(null);
      setIsOverTrash(false);
    } else if (mode === "draw" && currentStroke.length > 0) {
      saveToHistory();
      setStrokes((prev) => [...prev, { color: brushColor, size: brushSize, points: currentStroke }]);
      setCurrentStroke([]);
    }
  };

  // 检测是否在垃圾桶区域
  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOverTrash(true);
  };
  const handleTrashDragLeave = () => setIsOverTrash(false);
  const handleTrashDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOverTrash(false);
    // 从素材库拖入垃圾桶 - 不做任何事（素材库拖出的是新素材）
    // 从画布拖入垃圾桶 - 通过 handleMouseUp 处理
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.emoji) {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (CW / rect.width);
        const y = (e.clientY - rect.top) * (CH / rect.height);
        saveToHistory();
        setItems((prev) => [...prev, { emoji: data.emoji, x, y, size: data.size || 40 }]);
      }
    } catch {}
  };

  const clearCanvas = () => {
    // 保存当前状态到历史
    saveToHistory();
    setItems([]);
    setStrokes([]);
    setCurrentStroke([]);
  };

  // 保存当前状态到历史
  const saveToHistory = () => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ items: [...items], strokes: [...strokes] });
      return newHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  };

  // 撤销
  const handleUndo = () => {
    if (historyIndex < 0) return;
    const state = history[historyIndex];
    setItems(state.items);
    setStrokes(state.strokes);
    setHistoryIndex((prev) => prev - 1);
  };

  // 重做
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const state = history[historyIndex + 1];
    setItems(state.items);
    setStrokes(state.strokes);
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
        await fetch("/api/student/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ task_id: "1-1", design_image: imageData, game_rules: rules.filter((r) => r.trim()), game_name: gameName, design_reason: `游戏类型：${gameType || customType}`, duration_seconds: drawTime }),
        });
        lastSaveRef.current = Date.now();
      } catch {} finally {
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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const drawCanvas = canvasRef.current;
      const imageData = drawCanvas ? drawCanvas.toDataURL("image/png") : "";
      await fetch("/api/student/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task_id: "1-1", design_image: imageData, game_rules: rules.filter((r) => r.trim()), game_name: gameName, design_reason: `游戏类型：${gameType || customType}`, duration_seconds: drawTime }),
      });
      setDesignDone(true);
      setCurrentPhase("discuss");
    } catch { alert("保存失败"); }
  };

  const fetchGroupMembers = async (gid: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const res = await fetch(`/api/student/group-messages?group_id=${gid}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const msgs = await res.json();
        setChatMessages(msgs);
        const members = new Map<string, any>();
        for (const m of msgs) if (m.sender && !members.has(m.sender.id)) members.set(m.sender.id, m.sender);
        setGroupMembers(Array.from(members.values()));
      }
    } catch {}
  };

  const viewMemberDesign = async (memberId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const res = await fetch(`/api/student/group-tasks?user_id=${memberId}&task_id=1-1`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const task = await res.json(); if (task?.id) { setMemberDesign(task); setSelectedMember(groupMembers.find((m) => m.id === memberId)); } }
    } catch {}
  };

  const createGroup = async () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setGroupCode(code);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      await fetch("/api/student/group-messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ group_id: code, content: `小组已创建，口令：${code}`, message_type: "system" }) });
      fetchGroupMembers(code);
    } catch {}
  };

  const joinGroup = () => { if (joinCode.length === 4) { setGroupCode(joinCode); fetchGroupMembers(joinCode); } };

  const sendMessage = async () => {
    if (!chatInput.trim() || !groupCode) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const speakerName = speakingAs === "me" ? "" : groupMembers.find((m) => m.id === speakingAs)?.name || "";
      const content = speakerName ? `[${speakerName}] ${chatInput.trim()}` : chatInput.trim();
      const res = await fetch("/api/student/group-messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ group_id: groupCode, content, message_type: "text" }) });
      if (res.ok) { const m = await res.json(); if (speakingAs !== "me") m.sender = { ...m.sender, name: speakerName }; setChatMessages((p) => [...p, m]); setChatInput(""); fetchGroupMembers(groupCode); }
    } catch {}
  };

  const toggleVoice = () => {
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("不支持语音"); return; }
    const r = new SR(); r.lang = "zh-CN"; r.continuous = false;
    let final = "";
    r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) final += e.results[i][0].transcript; setChatInput(final); };
    r.onend = () => { setIsRecording(false); if (final && groupCode) sendVoice(final); };
    r.onerror = () => setIsRecording(false);
    recognitionRef.current = r; setIsRecording(true); r.start();
  };

  const sendVoice = async (text: string) => {
    if (!groupCode) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token; if (!token) return;
      const speakerName = speakingAs === "me" ? "" : groupMembers.find((m) => m.id === speakingAs)?.name || "";
      const content = speakerName ? `[${speakerName}] ${text}` : text;
      const res = await fetch("/api/student/group-messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ group_id: groupCode, content, message_type: "voice", voice_transcript: content }) });
      if (res.ok) { const m = await res.json(); if (speakingAs !== "me") m.sender = { ...m.sender, name: speakerName }; setChatMessages((p) => [...p, m]); }
    } catch {}
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* 阶段指示器 */}
      <div className="flex items-center gap-3 mb-3">
        {[{ id: "survey", label: "基础情况", icon: " " }, { id: "design", label: "个人设计", icon: "✏️" }, { id: "discuss", label: "小组讨论", icon: " " }].map((phase, i) => (
          <div key={phase.id} className="flex items-center gap-2">
            <button onClick={() => { if (phase.id === "survey") setCurrentPhase("survey"); if (phase.id === "design" && surveyDone) setCurrentPhase("design"); if (phase.id === "discuss" && designDone) setCurrentPhase("discuss"); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${currentPhase === phase.id ? "bg-indigo-500 text-white shadow-md" : "bg-white text-gray-500"}`}>{phase.icon} {phase.label}</button>
            {i < 2 && <div className="w-6 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* ========== 基础情况 ========== */}
      {currentPhase === "survey" && (
        <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">1. 你平时玩过游戏吗？</label><div className="flex gap-2"><input value={q1} onChange={(e) => setQ1(e.target.value)} placeholder="比如：经常玩、偶尔玩、没怎么玩过..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ1(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">2. 你玩过哪些游戏？最喜欢哪个？</label><div className="flex gap-2"><input value={q2} onChange={(e) => setQ2(e.target.value)} placeholder="比如：我的世界、王者荣耀、植物大战僵尸..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ2(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">3. 你接触过编程吗？</label><div className="flex gap-2"><input value={q3} onChange={(e) => setQ3(e.target.value)} placeholder="比如：学过Scratch、完全没接触过..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ3(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">4. 你有没有自己设计过游戏或者编过故事？</label><div className="flex gap-2"><input value={q4} onChange={(e) => setQ4(e.target.value)} placeholder="比如：用Scratch做过小游戏、编过冒险故事..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ4(text)} /></div></div>
            <div><label className="block text-base font-medium text-gray-700 mb-1.5">5. 你觉得做一个好游戏最重要的是什么？</label><div className="flex gap-2"><input value={q5} onChange={(e) => setQ5(e.target.value)} placeholder="比如：好玩、画面好看、有挑战性、能和朋友一起玩..." className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:border-indigo-400 outline-none" /><VoiceButton onResult={(text) => setQ5(text)} /></div></div>
          </div>
          <button onClick={async () => {
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
            } catch {}
            setSurveyDone(true);
            setCurrentPhase("design");
          }} disabled={!q1.trim() || !q2.trim() || !q3.trim() || !q4.trim() || !q5.trim()} className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-base font-medium transition mt-4">提交并进入设计 →</button>
        </div>
      )}

      {/* ========== 个人设计 ========== */}
      {currentPhase === "design" && (
        <div className="flex-1 flex gap-3 min-h-0">
          {/* 左侧素材库 */}
          <div className="w-44 bg-orange-100 rounded-2xl shadow-md p-3 flex flex-col border-4 border-orange-200 overflow-hidden">
            {/* 选项卡 */}
            <div className="flex gap-1 mb-2 shrink-0">
              {([["role", "角色"], ["bg", "背景"], ["prop", "道具"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setMaterialTab(key)} className={`flex-1 py-1.5 text-xs font-bold rounded-t-lg transition ${materialTab === key ? "bg-amber-50 text-amber-800 border-2 border-amber-300 border-b-0" : "bg-stone-200 text-stone-500 border-2 border-stone-300 border-b-0"}`}>{label}</button>
              ))}
            </div>
            {/* 素材列表 */}
            <div className="flex-1 bg-amber-50 border-2 border-amber-300 rounded-b-xl p-2 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2">
                {MATERIALS[materialTab].map((item, i) => (
                  <div key={i} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ emoji: item.emoji, size: materialTab === "bg" ? 60 : 40 })); e.dataTransfer.effectAllowed = "copy"; }}
                    className="flex flex-col items-center p-2 rounded-lg hover:bg-amber-100 cursor-grab active:cursor-grabbing transition select-none">
                    <span className="text-2xl leading-none">{item.emoji}</span>
                    <span className="text-xs text-amber-800 font-bold mt-1">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 中间画布 */}
          <div className="flex-1 bg-gray-200 rounded-2xl shadow-inner p-4 flex justify-center items-center border-4 border-gray-300 relative overflow-hidden">
            <div className="bg-white shadow-2xl relative shrink-0" style={{ width: "100%", maxWidth: CW, height: CH }}>
              <canvas ref={canvasRef} className="block absolute top-0 left-0 w-full h-full z-10" style={{ cursor: mode === "draw" ? "crosshair" : "default" }}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onDragOver={handleDragOver} onDrop={handleDrop} />
              {/* 垃圾桶（移动模式下显示，用于删除素材） */}
              {mode === "move" && items.length > 0 && (
                <div
                  className={`absolute bottom-16 right-3 w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all z-30 ${
                    isOverTrash ? "bg-red-500 text-white scale-125 shadow-lg" : "bg-red-100 text-red-500 hover:bg-red-200"
                  }`}
                  onDragOver={handleTrashDragOver}
                  onDragLeave={handleTrashDragLeave}
                  onDrop={handleTrashDrop}
                  title="拖动素材到此处删除"
                >
                  ️
                </div>
              )}
              {/* 工具栏 */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/95 rounded-xl px-4 py-2 shadow-lg border border-gray-200 z-30">
                <button onClick={() => setMode("move")} className={`text-sm px-3 py-1.5 rounded-lg font-bold transition ${mode === "move" ? "bg-amber-400 text-amber-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>  移动</button>
                <button onClick={() => setMode("draw")} className={`text-sm px-3 py-1.5 rounded-lg font-bold transition ${mode === "draw" ? "bg-amber-400 text-amber-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>✏️ 画笔</button>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button onClick={handleUndo} disabled={historyIndex < 0} className="text-sm px-2 py-1.5 rounded-lg font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition">↩️</button>
                <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="text-sm px-2 py-1.5 rounded-lg font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition">↪️</button>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                {COLORS.map((c) => (<button key={c} onClick={() => setBrushColor(c)} className={`w-6 h-6 rounded-full border-2 transition ${brushColor === c ? "border-gray-800 scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />))}
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <span className="text-xs text-gray-500">粗细</span>
                <input type="range" min={1} max={10} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-20" />
                <button onClick={clearCanvas} className="text-sm px-3 py-1.5 rounded-lg font-bold bg-red-100 text-red-600 hover:bg-red-200 transition">  清空</button>
              </div>
            </div>
          </div>

          {/* 右侧：游戏类型 + 规则 + 名称 */}
          <div className="w-72 bg-white rounded-2xl shadow-md border border-gray-100 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">⏱️ {formatTime(drawTime)}</span>
              {isSaving && <span className="text-xs text-green-500 animate-pulse">保存中...</span>}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-700 mb-2">  游戏类型</h3>
              <div className="grid grid-cols-3 gap-2">
                {["接东西", "躲避", "跑酷", "迷宫", "对战", "其他"].map((type) => (
                  <button key={type} onClick={() => setGameType(type)} className={`py-2 rounded-lg text-sm font-medium transition ${gameType === type ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{type}</button>
                ))}
              </div>
              {gameType === "其他" && <input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="输入你想做的游戏类型" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-2 outline-none" />}
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <h3 className="text-base font-bold text-gray-700 mb-2">  游戏规则</h3>
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 mb-2">
                {RULE_HINTS.map((hint, i) => (
                  <button key={i} onClick={() => { const idx = rules.findIndex((r) => !r.trim()); if (idx >= 0) { const nr = [...rules]; nr[idx] = hint; setRules(nr); } }} className="block w-full text-left text-sm text-amber-700 hover:bg-amber-100 px-2 py-1 rounded">• {hint}</button>
                ))}
              </div>
              {rules.map((rule, i) => (
                <div key={i} className="mb-2">
                  <label className="text-xs text-gray-500 mb-1">规则{i + 1}：</label>
                  <input value={rule} onChange={(e) => { const nr = [...rules]; nr[i] = e.target.value; setRules(nr); }} placeholder="如果...就..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 outline-none" />
                </div>
              ))}
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1">游戏名称</label>
              <input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="给游戏取个名字！" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 outline-none" />
            </div>
            <button onClick={saveDesign} disabled={(!gameType && !customType.trim()) || !gameName.trim()} className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition">保存并进入讨论 →</button>
          </div>
        </div>
      )}

      {/* ========== 小组讨论 ========== */}
      {currentPhase === "discuss" && (
        <div className="flex-1 flex flex-col min-h-0">
          {!groupCode ? (
            <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col items-center justify-center p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">  加入小组讨论</h2>
              <p className="text-base text-gray-500 mb-10">选择你的身份，开始小组讨论</p>
              <div className="flex gap-8 w-full max-w-lg">
                <button onClick={createGroup} className="flex-1 bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-200 rounded-2xl p-6 flex flex-col items-center transition">
                  <span className="text-5xl mb-3"> </span><span className="text-lg font-bold text-indigo-700 mb-2">我是组长</span><span className="text-sm text-indigo-500">创建小组，获取口令</span>
                </button>
                <div className="flex-1">
                  {!showJoinInput ? (
                    <button onClick={() => setShowJoinInput(true)} className="w-full h-full bg-green-50 hover:bg-green-100 border-2 border-green-200 rounded-2xl p-6 flex flex-col items-center transition">
                      <span className="text-5xl mb-3"> </span><span className="text-lg font-bold text-green-700 mb-2">我是组员</span><span className="text-sm text-green-500">输入口令，加入小组</span>
                    </button>
                  ) : (
                    <div className="w-full h-full bg-green-50 border-2 border-green-200 rounded-2xl p-6 flex flex-col items-center justify-center">
                      <span className="text-4xl mb-3"> </span><p className="text-base font-bold text-green-700 mb-4">输入4位口令</p>
                      <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="____" maxLength={4} className="w-40 text-center text-2xl font-mono font-bold px-4 py-3 border-2 border-green-300 rounded-xl outline-none focus:border-green-500 tracking-[0.5em]" />
                      <div className="flex gap-3 mt-4">
                        <button onClick={() => setShowJoinInput(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">返回</button>
                        <button onClick={joinGroup} disabled={joinCode.length !== 4} className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white rounded-lg text-sm font-medium transition">加入小组</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 p-4 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-800">  小组讨论</h2>
                <div className="flex items-center gap-2"><span className="text-sm text-gray-500">口令：</span><span className="text-lg font-mono font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{groupCode}</span></div>
              </div>
              <div className="flex-1 flex gap-4 min-h-0">
                {/* 左侧：成员设计展示 */}
                <div className="flex-[2] flex flex-col bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-sm font-bold text-gray-700">  查看设计：</span>
                    {groupMembers.length === 0 ? <span className="text-sm text-gray-400">等待成员加入...</span> : groupMembers.map((member) => (
                      <button key={member.id} onClick={() => viewMemberDesign(member.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${selectedMember?.id === member.id ? "bg-indigo-500 text-white" : "bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200"}`}>{member.name}</button>
                    ))}
                  </div>
                  {selectedMember && memberDesign ? (
                    <div className="flex-1 flex gap-4 min-h-0">
                      <div className="flex-1 flex flex-col">
                        <h3 className="text-sm font-bold text-gray-700 mb-2">{selectedMember.name} 的设计图</h3>
                        {memberDesign.design_image ? <img src={memberDesign.design_image} alt="设计图" className="flex-1 object-contain border border-gray-200 rounded-lg bg-white" /> : <div className="flex-1 flex items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-lg"><p className="text-sm">暂无设计图</p></div>}
                      </div>
                      <div className="w-64 flex flex-col">
                        <h3 className="text-sm font-bold text-gray-700 mb-2">  游戏规则</h3>
                        {memberDesign.game_name && <div className="mb-3 p-2.5 bg-white rounded-lg border border-gray-200"><p className="text-xs text-gray-500">游戏名称</p><p className="text-base font-bold text-gray-800">{memberDesign.game_name}</p></div>}
                        {memberDesign.game_rules?.length > 0 && <div className="flex-1 p-2.5 bg-white rounded-lg border border-gray-200 overflow-y-auto"><p className="text-xs text-gray-500 mb-2">规则列表</p>{memberDesign.game_rules.map((r: string, i: number) => <p key={i} className="text-sm text-gray-700 mb-1.5">• {r}</p>)}</div>}
                      </div>
                    </div>
                  ) : <div className="flex-1 flex items-center justify-center"><div className="text-center text-gray-400"><p className="text-5xl mb-3"> </p><p className="text-base">点击上方成员名字查看设计</p></div></div>}
                </div>

                {/* 右侧：聊天室 */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center gap-2 mb-2 p-2.5 bg-indigo-50 rounded-lg border border-indigo-200">
                    <span className="text-sm font-bold text-indigo-700">谁在说话：</span>
                    <button onClick={() => setSpeakingAs("me")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${speakingAs === "me" ? "bg-indigo-500 text-white" : "bg-white text-gray-600 hover:bg-indigo-100 border border-gray-200"}`}>我</button>
                    {groupMembers.map((member) => <button key={member.id} onClick={() => setSpeakingAs(member.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${speakingAs === member.id ? "bg-indigo-500 text-white" : "bg-white text-gray-600 hover:bg-indigo-100 border border-gray-200"}`}>{member.name}</button>)}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 mb-2 p-3 bg-gray-50 rounded-lg">
                    {chatMessages.length === 0 ? <p className="text-center text-gray-400 text-sm py-4">开始讨论吧！</p> : chatMessages.map((m) => <div key={m.id} className="bg-white rounded-lg px-3 py-2 shadow-sm"><p className="text-sm font-medium text-indigo-600">{m.sender?.name || "我"}</p><p className="text-sm">{m.message_type === "voice" ? `🎤 ${m.voice_transcript || m.content}` : m.content}</p></div>)}
                  </div>
                  <div className="p-2.5 bg-yellow-50 rounded-lg border border-yellow-200 mb-2"><p className="text-sm text-yellow-800">  提示：你觉得他/她的游戏最有趣的设计是什么？</p></div>
                  <div className="flex gap-2">
                    <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="说说你的想法..." className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none" />
                    <button onClick={sendMessage} className="px-5 py-2.5 bg-indigo-500 text-white rounded-lg text-sm font-medium">发送</button>
                    <button onClick={toggleVoice} className={`px-3 py-2.5 rounded-lg text-sm ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-gray-200 text-gray-700"}`}>{isRecording ? "⏹" : "🎤"}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
