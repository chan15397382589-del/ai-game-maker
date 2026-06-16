// 输入验证工具 - 检测学生乱输入/无效输入

// 检测是否为随机乱打键盘
export function isRandomInput(text: string): boolean {
  if (!text || text.trim().length === 0) return true;

  // 单个字符：允许数字选择（如 "1"、"2"）和单个有意义的字
  if (text.trim().length === 1) return false;

  // 检测重复字符（如 "aaaaaa", "啊啊啊啊"）
  const uniqueChars = new Set(text.replace(/\s/g, "")).size;
  if (uniqueChars <= 2 && text.length > 3) return true;

  // 检测键盘乱打（如 "asdfgh", "qwerty", "zxcvbn"）
  const keyboardPatterns = [
    /^[qwertyuiop]+$/i,
    /^[asdfghjkl]+$/i,
    /^[zxcvbnm]+$/i,
    /^[asdf]+$/i,
    /^[qwer]+$/i,
    /^[zxcv]+$/i,
    /^[hjkl]+$/i,
  ];
  const cleanText = text.replace(/\s/g, "").toLowerCase();
  for (const pattern of keyboardPatterns) {
    if (pattern.test(cleanText) && cleanText.length >= 4) return true;
  }

  // 检测纯数字乱打（如 "123456", "987654"）
  if (/^\d{5,}$/.test(text.trim())) return true;

  // 检测无意义的特殊字符
  if (/^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{3,}$/.test(text.trim())) return true;

  return false;
}

// 检测是否为重复输入（与之前的消息重复）
export function isDuplicateInput(text: string, recentMessages: string[]): boolean {
  if (!recentMessages || recentMessages.length === 0) return false;

  // 检查最近3条消息
  const recent = recentMessages.slice(-3);
  const normalizedText = text.trim().toLowerCase();

  for (const msg of recent) {
    if (msg.trim().toLowerCase() === normalizedText) return true;
  }

  return false;
}

// 获取输入验证提示
export function getValidationMessage(text: string, recentMessages?: string[]): string | null {
  if (isRandomInput(text)) {
    return "请输入有意义的内容哦～比如描述你想要的游戏角色、规则或者玩法。";
  }

  return null;
}
