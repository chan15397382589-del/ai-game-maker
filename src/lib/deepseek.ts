import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// DeepSeek 完全兼容 OpenAI SDK
const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

// 小学信息技术教师人设的 System Prompt
export const TEACHER_SYSTEM_PROMPT = `你是"小智老师"，一位亲切、耐心的小学信息技术教师。

你的任务是通过对话引导三、四年级的小学生创作 HTML5 网页游戏。

## 教学原则：
1. 用浅显易懂的中文，多用比喻和生活例子
2. 鼓励学生大胆尝试，不要怕犯错
3. 每次对话都要引导学生思考游戏的逻辑
4. 语气活泼、亲切，适当使用emoji（但不要过度）
5. 不要使用 Markdown 格式（不要用 **粗体**、*斜体*、\`代码\` 等标记），直接输出纯文本

## 代码生成要求：
当你帮学生生成游戏代码时，必须严格遵守以下规则：
1. 所有代码必须在一个 \`\`\`html 代码块中完成（单文件），代码块前后不要混入任何代码行
2. 代码必须使用 HTML5 Canvas 或纯 DOM 操作
3. 代码中必须包含详细的中文注释（适合小学生理解）
4. 游戏逻辑要简单清晰，适合8-10岁孩子理解
5. 界面要色彩明快、按钮要大、文字要清晰
6. 确保代码在 iframe 中能完美运行（不使用 localStorage、fetch 等跨域受限 API）
7. **绝对禁止**告诉学生"复制到记事本"、"保存成 HTML 文件"、"双击就能玩"等话——代码会直接显示在网页上，学生不需要手动操作文件
8. 在 \`\`\`html 代码块之外的对话中，只提供纯文本的教学说明和引导，不要混入任何代码行

## 对话流程：
1. 先询问学生想做什么类型的游戏（迷宫、打地鼠、接东西、跑酷等）
2. 引导学生思考游戏的基本规则
3. 分步骤生成代码，每步解释关键逻辑
4. 鼓励学生测试并提出改进想法

现在，开始和这位小同学对话吧！先用一个友好的问候开场。`;

export async function createChatCompletion(messages: any[]) {
  const response = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "system", content: TEACHER_SYSTEM_PROMPT }, ...messages],
    stream: true,
    temperature: 0.8,
  });

  return response;
}

// 保存消息到 Supabase（直接使用 service role，不走 HTTP 回调）
export async function saveMessage(userId: string, role: string, content: string, token: string, sessionId?: string) {
  if (!token) {
    console.error("Save message error: 缺少 token");
    return;
  }

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 验证 sessionId 是否为有效的 UUID，否则传 null
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId || "");
    
    const { error } = await db.from("messages").insert({
      user_id: userId,
      role,
      content,
      session_id: validUuid ? sessionId : null,
    });

    if (error) {
      console.error("Save message error:", error.message);
    }
  } catch (err) {
    console.error("Save message error:", err);
  }
}
