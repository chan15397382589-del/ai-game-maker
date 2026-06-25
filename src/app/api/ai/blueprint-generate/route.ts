import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/deepseek";
import { chatQueue } from "@/lib/requestQueue";

const deepseekAI = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
});

async function generateGame(prompt: string, maxRetries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chatQueue.add(() => deepseekAI.chat.completions.create({
        model: "deepseek-chat",
        max_tokens: 8192,
        temperature: 0.3 + attempt * 0.1,
        messages: [{ role: "user", content: prompt }],
      }));

      const text = response.choices?.[0]?.message?.content || "";
      if (!text) continue;

      const code = extractCode(text);
      if (code) return code;

      const looseCode = extractLooseCode(text);
      if (looseCode) return looseCode;

    } catch (err: any) {
      console.error(`Blueprint generate attempt ${attempt + 1} failed:`, err.message);
      if (attempt === maxRetries) throw err;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { imageUrl, gameName, rules } = await req.json();

    const rulesText = (rules || []).filter((r: string) => r.trim()).map((r: string) => `如果${r}`).join("；");

    let prompt = `生成一个"${gameName || "游戏"}"的完整HTML5网页游戏代码。`;
    if (rulesText) prompt += `游戏规则：${rulesText}。`;
    prompt += `

要求：
1. 直接输出完整HTML代码，用\`\`\`html包裹，以</html>结尾
2. Canvas必须填满整个页面：canvas.width=window.innerWidth; canvas.height=window.innerHeight; body设置margin:0;padding:0;overflow:hidden;background:#000;
3. 使用HTML5 Canvas绘制所有图形，颜色明快、卡通风格
4. 实现基本物理效果（重力、碰撞、反弹）
5. 实现游戏规则（计分、胜负判定）
6. 必须有游戏循环：function gameLoop() { ... requestAnimationFrame(gameLoop); }
7. 输入事件绑定：document.addEventListener('keydown')、canvas.addEventListener('click')、canvas.addEventListener('touchstart')
8. 添加中文注释
9. 代码在iframe中能正常运行，不使用外部资源
10. HTML结构完整：<!DOCTYPE html>开头，</html>结尾

直接生成代码，不要解释。`;

    const code = await generateGame(prompt);
    if (code) return NextResponse.json({ code });

    return NextResponse.json({ error: "未能生成代码，请重试" }, { status: 500 });
  } catch (err: any) {
    console.error("Blueprint generate error:", err);
    return NextResponse.json({ error: err.message || "生成失败" }, { status: 500 });
  }
}

function extractCode(text: string): string | null {
  const codeMatch = text.match(/```html\s*\n([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();
  const anyFence = text.match(/```\s*\n([\s\S]*?)```/);
  if (anyFence && anyFence[1].includes("<")) return anyFence[1].trim();
  if (text.includes("<!DOCTYPE") || text.includes("<html")) {
    const start = text.indexOf("<!DOCTYPE") !== -1 ? text.indexOf("<!DOCTYPE") : text.indexOf("<html");
    const end = text.lastIndexOf("</html>");
    if (start !== -1 && end !== -1) return text.substring(start, end + 7).trim();
  }
  const htmlMatch = text.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch) return htmlMatch[0].trim();
  return null;
}

function extractLooseCode(text: string): string | null {
  const canvasMatch = text.match(/<canvas[\s\S]*<\/canvas>/i);
  const scriptMatch = text.match(/<script[\s\S]*<\/script>/i);
  if (canvasMatch || scriptMatch) {
    const canvas = canvasMatch ? canvasMatch[0] : '<canvas id="gameCanvas" width="800" height="600"></canvas>';
    const script = scriptMatch ? scriptMatch[0] : '<script>// Game code</script>';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>游戏</title>
<style>* { margin: 0; padding: 0; box-sizing: border-box; } body { overflow: hidden; background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; } canvas { display: block; border-radius: 8px; }</style>
</head>
<body>${canvas}${script}</body>
</html>`;
  }
  const htmlPattern = text.match(/<!(?:DOCTYPE|doctype)[\s\S]*<\/html>/i);
  if (htmlPattern) return htmlPattern[0].trim();
  const tagPattern = text.match(/<[a-z][\s\S]{100,}<\/[a-z]>/i);
  if (tagPattern) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>游戏</title><style>*{margin:0;padding:0;}body{overflow:hidden;}</style></head><body>${tagPattern[0]}</body></html>`;
  }
  return null;
}
