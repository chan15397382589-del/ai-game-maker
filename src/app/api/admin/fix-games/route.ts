import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/deepseek";

const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
});

// 检查游戏代码是否完整可玩
function isGameComplete(code: string): { valid: boolean; reason: string } {
  if (!code || code.length < 300) return { valid: false, reason: "代码太短" };
  if (!code.includes("</html>") && !code.includes("</HTML>")) return { valid: false, reason: "缺少</html>" };
  if (!code.includes("<canvas") && !code.includes("<div") && !code.includes("<button")) return { valid: false, reason: "无 Canvas/DOM 元素" };
  if (!code.includes("requestAnimationFrame") && !code.includes("setInterval") && !code.includes("setTimeout")) return { valid: false, reason: "无游戏循环" };
  if (!code.includes("addEventListener") && !code.includes("onkeydown") && !code.includes("onclick") && !code.includes("onmousemove") && !code.includes("ontouchstart")) return { valid: false, reason: "无输入事件绑定" };
  if (!code.includes("function") && !code.includes("=>")) return { valid: false, reason: "无函数定义" };
  return { valid: true, reason: "ok" };
}

// 用 DeepSeek 修复不完整的游戏代码
async function fixGameCode(code: string, gameName: string): Promise<string | null> {
  const prompt = `下面是一个不完整的HTML5游戏代码，请修复它使其成为一个完整的、可以玩的游戏。

当前代码：
\`\`\`html
${code.substring(0, 20000)}
\`\`\`

要求：
1. 输出完整的 <!DOCTYPE html> 到 </html>
2. 必须有 Canvas 或 DOM 游戏元素
3. 必须有 requestAnimationFrame 游戏循环
4. 必须绑定键盘/鼠标/触摸事件让玩家能操作
5. 有得分或胜负判定
6. 保持原有游戏的风格和主题 "${gameName}"
7. 只输出代码，不要解释`;

  try {
    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 8192,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices?.[0]?.message?.content || "";
    const codeMatch = text.match(/```html\s*\n?([\s\S]*?)```/);
    if (codeMatch) return codeMatch[1].trim();
    if (text.includes("<!DOCTYPE") && text.includes("</html>")) return text.trim();
    return null;
  } catch (err: any) {
    console.error("Fix game error:", err.message);
    return null;
  }
}

// GET: 检查并修复游戏
export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const admin = await getVerifiedAdmin(token);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const grade = searchParams.get("grade") || "3";
  const classNum = searchParams.get("class_num") || "6";
  const action = searchParams.get("action") || "check"; // check | fix

  const db = getSupabaseAdmin();

  // 获取班级学生
  const { data: students } = await db
    .from("users").select("id").eq("grade", parseInt(grade))
    .eq("class_num", parseInt(classNum)).eq("role", "student");
  const studentIds = (students || []).map((s: any) => s.id);

  // 获取他们的游戏
  const { data: games } = await db
    .from("conversations").select("id, user_id, title, html_code")
    .in("user_id", studentIds).not("html_code", "is", null)
    .order("updated_at", { ascending: false }).limit(200);

  // 检查每个游戏
  const results: any[] = [];
  for (const game of games || []) {
    const check = isGameComplete(game.html_code || "");
    results.push({
      id: game.id,
      title: game.title,
      user_id: game.user_id,
      code_length: (game.html_code || "").length,
      valid: check.valid,
      reason: check.reason,
      fixed: false,
    });
  }

  const broken = results.filter((r: any) => !r.valid);

  // 修复模式
  if (action === "fix" && broken.length > 0) {
    let fixed = 0;
    for (const item of broken) {
      const game = (games || []).find((g: any) => g.id === item.id);
      if (!game) continue;
      const newCode = await fixGameCode(game.html_code || "", game.title || "");
      if (newCode) {
        await db.from("conversations").update({ html_code: newCode }).eq("id", item.id);
        item.fixed = true;
        item.code_length = newCode.length;
        fixed++;
      }
    }
    return NextResponse.json({ total: results.length, broken: broken.length, fixed, results: broken });
  }

  return NextResponse.json({
    total: results.length,
    broken: broken.length,
    summary: broken.map((r: any) => `${r.title}(${r.id}): ${r.reason}`),
    details: broken,
  });
}
