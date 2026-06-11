// 脏话关键词黑名单（中文 + 英文）
const PROFANITY_LIST: string[] = [
  // 中文脏话
  "傻逼", "sb", "傻b", "傻B", "尼玛", "你妈", "操你", "草你", "艹", "特么", "他妈",
  "混蛋", "白痴", "弱智", "脑残", "智障", "废物", "垃圾人", "去死", "滚蛋",
  "fuck", "shit", "damn", "bitch", "asshole", "bastard", "dick",
  // 性相关
  "色情", "裸体", "做爱", "性交", "强奸", "av", "porn", "sex",
  "黄色", "约炮", "操", "干你", "日你",
];

// 游戏相关词汇（用于检测评论是否与游戏相关）
const GAME_RELATED_WORDS: string[] = [
  "游戏", "好玩", "颜色", "速度", "难度", "角色", "分数", "得分", "关卡",
  "控制", "操作", "按键", "移动", "跳跃", "碰撞", "背景", "音乐", "音效",
  "画面", "设计", "创意", "想法", "规则", "玩法", "通关", "失败", "胜利",
  "按钮", "界面", "太快", "太慢", "太难", "太简单", "有趣", "无聊",
  "喜欢", "厉害", "棒", "酷", "帅", "可爱", "漂亮", "清晰", "模糊",
  "改", "调整", "增加", "减少", "优化", "建议", "试试", "能不能",
  "主角", "敌人", "障碍", "道具", "奖励", "生命", "血量", "时间",
  "星星", "金币", "积分", "小球", "方块", "飞机", "小鸟", "跑酷",
  "迷宫", "打地鼠", "接东西", "弹球", "贪吃蛇",
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// 检查是否包含脏话
function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY_LIST.some((word) => lower.includes(word.toLowerCase()));
}

// 检查是否为无意义内容
function isMeaningless(text: string): boolean {
  const trimmed = text.trim();

  // 过短
  if (trimmed.length <= 1) return true;

  // 纯数字
  if (/^\d+$/.test(trimmed)) return true;

  // 纯符号
  if (/^[^\w一-鿿]+$/.test(trimmed)) return true;

  // 重复字符超过6次
  if (/(.)\1{6,}/.test(trimmed)) return true;

  // 纯表情符号
  if (/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+$/u.test(trimmed)) return true;

  return false;
}

// 检查评论是否与游戏相关
function isGameRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return GAME_RELATED_WORDS.some((word) => lower.includes(word));
}

// 验证评论（综合检查）
export function validateComment(text: string): ValidationResult {
  if (!text || !text.trim()) {
    return { valid: false, error: "评论不能为空" };
  }

  if (containsProfanity(text)) {
    return { valid: false, error: "评论包含不当内容，请修改后再发送" };
  }

  if (isMeaningless(text)) {
    return { valid: false, error: "评论内容太短或无意义，请写一些关于游戏的具体想法" };
  }

  if (!isGameRelated(text)) {
    return { valid: false, error: "评论需要和游戏相关哦！比如可以说说游戏哪里好玩、哪里可以改进" };
  }

  if (text.length > 500) {
    return { valid: false, error: "评论太长了，请控制在500字以内" };
  }

  return { valid: true };
}

// 验证游戏名称
export function validateGameName(text: string): ValidationResult {
  if (!text || !text.trim()) {
    return { valid: false, error: "游戏名称不能为空" };
  }

  if (containsProfanity(text)) {
    return { valid: false, error: "游戏名称包含不当内容，请换一个名字" };
  }

  if (text.trim().length < 2) {
    return { valid: false, error: "游戏名称至少需要2个字" };
  }

  if (text.trim().length > 20) {
    return { valid: false, error: "游戏名称不能超过20个字" };
  }

  return { valid: true };
}
