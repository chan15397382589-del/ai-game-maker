import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/deepseek";

const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
});

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const db = getSupabaseAdmin();

    // 获取学生的所有对话消息
    const { data: messages } = await db
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "还没有对话记录" }, { status: 400 });
    }

    // 构建对话摘要
    const conversation = messages
      .map((m: any) => `${m.role === "user" ? "学生" : "小智老师"}: ${m.content.substring(0, 300)}`)
      .join("\n");

    // 让 DeepSeek 生成反思
    const prompt = `你是一个教育助手。请根据以下学生的AI游戏创作对话，以学生的口吻填写反思表。
用第三人称反推学生的感受。输出 JSON 格式。

对话记录：
${conversation.substring(0, 8000)}

请输出以下 JSON（只输出 JSON，不要其他文字）：
{
  "q1": { "name": "游戏名称", "play": "玩法描述" },
  "q2": { "cond": "触发条件", "result": "结果" },
  "q3": { "difficulty": "遇到的困难", "solve": "解决方法" },
  "q4": { "feedback": "同伴评价(推测)", "feel": "我的感受" },
  "q5": { "redo": "想改进的地方" }
}`;

    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 2000,
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices?.[0]?.message?.content || "";
    // 解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "生成失败" }, { status: 500 });

    const reflection = JSON.parse(jsonMatch[0]);

    // 保存到最新会话
    const { data: convs } = await db
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (convs && convs.length > 0) {
      await db.from("conversations").update({
        reflection: JSON.stringify(reflection),
        updated_at: new Date().toISOString(),
      }).eq("id", convs[0].id);
    }

    return NextResponse.json({ reflection, saved: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
