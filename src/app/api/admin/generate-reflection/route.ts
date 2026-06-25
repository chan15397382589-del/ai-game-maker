import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
});

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { userId, grade, classNum } = await req.json();

    // 获取用户ID列表
    let userQuery = supabaseAdmin.from("users").select("id, name, student_id").eq("role", "student");
    if (userId) {
      userQuery = userQuery.eq("id", userId);
    } else if (grade) {
      userQuery = userQuery.eq("grade", parseInt(grade));
      if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));
    }
    const { data: students } = await userQuery.limit(100);

    if (!students || students.length === 0) {
      return NextResponse.json({ error: "没有找到学生" }, { status: 404 });
    }

    const results: any[] = [];

    for (const student of students) {
      try {
        // 获取学生的对话消息
        const { data: messages } = await supabaseAdmin
          .from("messages")
          .select("role, content, created_at")
          .eq("user_id", student.id)
          .order("created_at", { ascending: true })
          .limit(200);

        if (!messages || messages.length < 3) {
          results.push({ name: student.name, id: student.student_id, status: "跳过", reason: "对话太少" });
          continue;
        }

        // 获取同伴互评
        const { data: peerReviews } = await supabaseAdmin
          .from("peer_reviews")
          .select("q1_enjoy, q2_suggestion, q3_bug")
          .eq("reviewee_id", student.id);

        const reviewText = (peerReviews || []).map((r: any) =>
          `同学评价：好玩-${r.q1_enjoy || ""}，建议-${r.q2_suggestion || ""}，问题-${r.q3_bug || ""}`
        ).join("\n");

        // 构建对话摘要
        const conversation = messages
          .map((m: any) => `${m.role === "user" ? "学生" : "AI"}: ${(m.content || "").substring(0, 200)}`)
          .join("\n");

        const prompt = `你是教育助手。根据学生的AI游戏创作对话，以学生的口吻生成反思。

对话记录：
${conversation.substring(0, 6000)}

同伴反馈：
${reviewText.substring(0, 1000) || "无"}

只输出 JSON：
{
  "q1": { "name": "游戏名", "play": "玩法" },
  "q2": { "cond": "如果什么条件", "result": "就发生什么" },
  "q3": { "difficulty": "困难", "solve": "解决方法" },
  "q4": { "feedback": "同伴说xxx", "feel": "我觉得xxx" },
  "q5": { "redo": "会改xxx" }
}`;

        const response = await deepseek.chat.completions.create({
          model: "deepseek-chat", max_tokens: 2000, temperature: 0.5,
          messages: [{ role: "user", content: prompt }],
        });

        const text = response.choices?.[0]?.message?.content || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          results.push({ name: student.name, id: student.student_id, status: "失败", reason: "AI返回格式错误" });
          continue;
        }

        const reflection = JSON.parse(jsonMatch[0]);

        // 保存
        const { data: convs } = await supabaseAdmin
          .from("conversations")
          .select("id").eq("user_id", student.id)
          .order("updated_at", { ascending: false }).limit(1);

        if (convs && convs.length > 0) {
          await supabaseAdmin.from("conversations").update({
            reflection: JSON.stringify(reflection),
            updated_at: new Date().toISOString(),
          }).eq("id", convs[0].id);
        }

        results.push({ name: student.name, id: student.student_id, status: "成功" });
      } catch (err: any) {
        results.push({ name: student.name, id: student.student_id, status: "失败", reason: err.message });
      }
    }

    const success = results.filter((r: any) => r.status === "成功").length;
    return NextResponse.json({ total: students.length, success, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
