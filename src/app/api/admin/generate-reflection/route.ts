import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
});

// 检查反思是否完整有效
function isReflectionValid(reflection: any): boolean {
  if (!reflection) return false;
  try {
    const ref = typeof reflection === "string" ? JSON.parse(reflection) : reflection;
    const keys = ["q1", "q2", "q3", "q4", "q5"];
    for (const k of keys) {
      const v = ref[k];
      if (!v) return false;
      // 检查是否为乱填（纯符号、纯数字、过短）
      const text = typeof v === "string" ? v : Object.values(v).join("");
      if (!text || text.length < 2) return false;
      if (/^[\d\s]+$/.test(text)) return false; // 纯数字
      if (/^[^a-zA-Z一-鿿]+$/.test(text)) return false; // 无中英文
    }
    return true;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { userId, grade, class_num } = await req.json();

    let userQuery = supabaseAdmin.from("users").select("id, name, student_id").eq("role", "student");
    if (userId) {
      userQuery = userQuery.eq("id", userId);
    } else if (grade) {
      userQuery = userQuery.eq("grade", parseInt(grade));
      if (class_num) userQuery = userQuery.eq("class_num", parseInt(class_num));
    }
    const { data: students } = await userQuery.limit(100);
    if (!students || students.length === 0) {
      return NextResponse.json({ error: "没有找到学生" }, { status: 404 });
    }

    const results: any[] = [];

    for (const student of students) {
      try {
        // 获取最新会话和其反思
        const { data: convs } = await supabaseAdmin
          .from("conversations")
          .select("id, reflection")
          .eq("user_id", student.id)
          .order("updated_at", { ascending: false })
          .limit(1);

        const existingRef = convs?.[0]?.reflection;

        // 检查已有反思是否完整有效
        if (existingRef && isReflectionValid(existingRef)) {
          results.push({ name: student.name, id: student.student_id, status: "跳过", reason: "已有完整反思" });
          continue;
        }

        // 获取对话消息
        const { data: messages } = await supabaseAdmin
          .from("messages")
          .select("role, content")
          .eq("user_id", student.id)
          .order("created_at", { ascending: true })
          .limit(200);

        if (!messages || messages.length < 3) {
          results.push({ name: student.name, id: student.student_id, status: "跳过", reason: "对话太少" });
          continue;
        }

        // 获取游戏设计数据
        const { data: designTask } = await supabaseAdmin
          .from("student_tasks")
          .select("game_name, game_rules, design_reason")
          .eq("user_id", student.id)
          .eq("task_id", "1-1")
          .maybeSingle();

        let designInfo = "";
        if (designTask) {
          designInfo = `游戏名称：${designTask.game_name || "未命名"}\n`;
          if (designTask.game_rules?.length > 0) {
            designInfo += `游戏规则：${designTask.game_rules.map((r: string) => `如果${r}`).join("；")}\n`;
          }
          if (designTask.design_reason) {
            try {
              const reason = JSON.parse(designTask.design_reason);
              if (reason.ai_prompt) designInfo += `设计描述：${reason.ai_prompt}\n`;
            } catch {
              if (typeof designTask.design_reason === "string" && designTask.design_reason.length < 200) {
                designInfo += `设计想法：${designTask.design_reason}\n`;
              }
            }
          }
        }

        // 获取同伴互评
        const { data: peerReviews } = await supabaseAdmin
          .from("peer_reviews")
          .select("q1_enjoy, q2_suggestion, q3_bug")
          .eq("reviewee_id", student.id);

        const reviewText = (peerReviews || []).map((r: any) =>
          `同学觉得：${r.q1_enjoy || ""}；建议：${r.q2_suggestion || ""}；问题：${r.q3_bug || ""}`
        ).join("\n");

        // 构建对话
        const conversation = messages
          .map((m: any) => `${m.role === "user" ? "学生" : "AI老师"}: ${(m.content || "").substring(0, 150)}`)
          .join("\n");

        const prompt = `你是教育助手。根据学生的游戏设计和对话记录，以学生自己的口吻生成反思。

【游戏设计】
${designInfo || "无"}

【创作对话】
${conversation.substring(0, 5000)}

【同伴反馈】
${reviewText.substring(0, 800) || "暂无"}

只输出 JSON，不作解释：
{
  "q1": { "name": "基于设计信息的游戏名", "play": "学生描述的玩法" },
  "q2": { "cond": "游戏的核心规则条件", "result": "满足条件后的结果" },
  "q3": { "difficulty": "从对话中推测的困难", "solve": "如何解决的" },
  "q4": { "feedback": "同伴的评价", "feel": "学生对评价的感受" },
  "q5": { "redo": "学生可能想改进的地方" }
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
        if (convs && convs.length > 0) {
          await supabaseAdmin.from("conversations").update({
            reflection: JSON.stringify(reflection),
            updated_at: new Date().toISOString(),
          }).eq("id", convs[0].id);
          results.push({ name: student.name, id: student.student_id, status: "成功", reason: existingRef ? "覆盖乱填" : "新生成" });
        } else {
          results.push({ name: student.name, id: student.student_id, status: "跳过", reason: "无会话" });
        }
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
