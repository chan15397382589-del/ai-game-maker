import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// DeepSeek API (OpenAI 兼容接口)
// 优先 DEEPSEEK_API_KEY，其次 ANTHROPIC_AUTH_TOKEN（旧），最后 PROXY_API_KEY
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.PROXY_API_KEY || "";
const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: deepseekApiKey,
});

// Supabase 服务端客户端单例
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
  {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
    global: {
      headers: { "x-my-app": "ai-game-classroom-server" },
    },
  }
);

// 兼容旧代码
export function getSupabaseAdmin() {
  return supabaseAdmin;
}

// 小学信息技术教师人设的 System Prompt
export const TEACHER_SYSTEM_PROMPT = `你是"小智老师"，一位亲切、耐心的小学信息技术教师，也是学生的"游戏设计教练"。

## 身份
- 你的名字：小智老师
- 你的学生：小学3-6年级的学生
- 你的任务：帮助学生设计并生成HTML5游戏

## 核心教学理念
- 学生是"游戏设计师"，你是他们的"助手"
- 用简单、鼓励的语言，像和朋友聊天一样
- 每个学生都有自己的想法，你要帮助他们实现

## 输出格式规则（必须严格遵守）
1. **只输出纯文本**，除非学生要求查看代码
2. 游戏代码用 \`\`\`html ... \`\`\` 包裹
3. 代码必须完整可运行，包含 <!DOCTYPE html> 到 </html>
4. **必须包含键盘/鼠标输入处理**，让学生能真正玩
5. 使用 Canvas 或 DOM 元素实现游戏逻辑
6. 游戏要有明确的胜利/失败条件

## 教学流程
1. **了解想法**：问学生想做什么类型的游戏
2. **确认规则**：帮学生理清游戏规则
3. **生成基础版**：先做一个能玩的基础版本
4. **逐步改进**：根据学生反馈一次只改一个地方

## 对话风格
- 用"你"称呼学生，用"我"自称
- 用emoji让对话更生动
- 肯定学生的想法，再给出建议
- 解释技术概念时用比喻`;

// 基础教学脚手架
export const BASE_SCAFFOLDING = `

## 基础教学脚手架
- 每次只改一个功能，改完让学生试玩再改下一个
- 学生说不出想要什么时，给2-3个具体选项（不要超过3个）
- 学生遇到困难时，先问"你觉得问题出在哪里？"而不是直接给答案
- 每次修改后确认："现在这样你满意吗？"
- 生成代码后，用一两句话简单说明做了什么`;

// SRL 元认知支架附加内容
export const SRL_SCAFFOLD_ADDON = `

## SRL 元认知支架
- 开始前：引导学生先思考"最重要的规则是什么"
- 过程中：鼓励学生预测修改效果"你猜改了之后会怎样？"
- 遇到问题：引导学生对比规则和实际效果
- 完成后：引导学生反思创作过程
- 用"先想一想..."、"你预测..."、"检查一下..."等引导语`;

export async function createChatCompletion(messages: any[], currentCode?: string, srlCondition?: string) {
  // 构建系统提示词
  let systemPrompt = TEACHER_SYSTEM_PROMPT + BASE_SCAFFOLDING;

  // SRL支架组额外添加元认知引导
  if (srlCondition === "srl_scaffold") {
    systemPrompt += SRL_SCAFFOLD_ADDON;
  }

  // 构思阶段（无代码）
  if (!currentCode) {
    systemPrompt += `\n\n⚠️ 构思阶段。先问规则，再做游戏。\n- 问一个最关键的问题：游戏的核心规则是什么？\n- 禁止反问"主角？障碍物？得分？"——一次只问一个问题\n- 学生说清楚规则后，确认规则再做基础版`;
  }

  // 创作阶段（有代码）
  if (currentCode && currentCode.length < 30000) {
    systemPrompt += `\n\n⚠️ 创作阶段。每次只改一个东西，改完立刻展示效果。\n当前游戏代码：\n\`\`\`html\n${currentCode}\n\`\`\``;
  }

  // 消息格式转换：确保 user/assistant 交替
  const formattedMessages = messages
    .filter((m: any) => m.role === "user" || m.role === "assistant")
    .map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content || "",
    }));

  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      ...formattedMessages,
    ],
    max_tokens: 8192,
    temperature: 0.7,
    stream: true,
  });

  return response;
}

// AI建议类型自动分类
export function classifyAiSuggestion(content: string): string {
  if (/[①②③④⑤]|[1-5][.、]\s*\S/.test(content) || /[ABC][.、]\s*\S/.test(content)) {
    return "options";
  }
  if (/```html/i.test(content) || /```[\s\S]*?```/.test(content)) {
    return "generate";
  }
  if (/[?？]/.test(content)) {
    return "question";
  }
  if (/检查|测试|试试|看看.*对不对|排查|bug|错误/.test(content)) {
    return "debug_guide";
  }
  if (/很好|不错|棒|赞|建议|但是|不过|可以改进/.test(content)) {
    return "feedback";
  }
  return "confirm";
}

// 保存消息到 Supabase
export async function saveMessage(
  userId: string,
  role: string,
  content: string,
  token: string,
  sessionId?: string,
  inputMethod?: string,
  hasCode?: boolean,
  aiSuggestionType?: string
) {
  if (!token) {
    console.error("Save message error: 缺少 token");
    return;
  }

  const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId || "");

  const row: any = {
    user_id: userId,
    role,
    content,
    session_id: validUuid ? sessionId : null,
  };

  if (inputMethod) row.input_method = inputMethod;
  if (hasCode !== undefined) row.has_code = hasCode;
  if (aiSuggestionType) row.ai_suggestion_type = aiSuggestionType;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabaseAdmin.from("messages").insert(row);
      if (!error) return;
      console.error(`Save message attempt ${attempt} failed:`, error.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    } catch (err: any) {
      console.error(`Save message attempt ${attempt} error:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  console.error("Save message failed after 3 attempts for user:", userId);
}
