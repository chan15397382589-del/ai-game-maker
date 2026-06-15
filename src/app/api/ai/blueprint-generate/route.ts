import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/deepseek";

const mimo = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || "placeholder",
  baseURL: "https://token-plan-sgp.xiaomimimo.com/anthropic",
});

async function generateGame(prompt: string, maxRetries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await mimo.messages.create({
        model: "mimo-v2.5",
        max_tokens: 8192,
        temperature: 0.3 + attempt * 0.1, // 每次重试增加随机性
        messages: [{ role: "user", content: prompt }],
      });

      // 提取文本内容（跳过 thinking 块）
      let text = "";
      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        }
      }

      if (!text) continue;

      // 提取代码
      const code = extractCode(text);
      if (code) return code;

      // 如果没有提取到代码但有文本，尝试用更宽松的方式提取
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
    // 验证用户身份
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { imageUrl, gameName, rules } = await req.json();

    const rulesText = (rules || []).filter((r: string) => r.trim()).map((r: string) => `如果${r}`).join("；");

    // 构建文本提示词（图片可选）
    let prompt = `生成一个"${gameName || "游戏"}"的完整HTML5网页游戏代码。`;
    if (rulesText) prompt += `游戏规则：${rulesText}。`;
    prompt += `

要求：
1. 直接输出完整HTML代码，用\`\`\`html包裹，以</html>结尾
2. Canvas使用固定尺寸800x600，body设置margin:0;padding:0;overflow:hidden
3. 使用HTML5 Canvas绘制所有图形，颜色明快、卡通风格
4. 实现基本物理效果（重力、碰撞、反弹）
5. 实现游戏规则（计分、胜负判定）
6. 必须有游戏循环：function gameLoop() { ... requestAnimationFrame(gameLoop); }
7. 输入事件绑定：document.addEventListener('keydown')、canvas.addEventListener('click')、canvas.addEventListener('touchstart')
8. 添加中文注释
9. 代码在iframe中能正常运行，不使用外部资源
10. HTML结构完整：<!DOCTYPE html>开头，</html>结尾

直接生成代码，不要解释。`;

    // 带重试的生成
    const code = await generateGame(prompt);

    if (code) {
      return NextResponse.json({ code });
    }

    return NextResponse.json({ error: "未能生成代码，请重试" }, { status: 500 });
  } catch (err: any) {
    console.error("Blueprint generate error:", err);
    return NextResponse.json({ error: err.message || "生成失败" }, { status: 500 });
  }
}

function extractCode(text: string): string | null {
  // 1. 匹配 ```html ... ```
  const codeMatch = text.match(/```html\s*\n([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();

  // 2. 匹配 ``` ... ``` (包含HTML标签)
  const anyFence = text.match(/```\s*\n([\s\S]*?)```/);
  if (anyFence && anyFence[1].includes("<")) return anyFence[1].trim();

  // 3. 匹配 <!DOCTYPE html> 到 </html>
  if (text.includes("<!DOCTYPE") || text.includes("<html")) {
    const start = text.indexOf("<!DOCTYPE") !== -1 ? text.indexOf("<!DOCTYPE") : text.indexOf("<html");
    const end = text.lastIndexOf("</html>");
    if (start !== -1 && end !== -1) return text.substring(start, end + 7).trim();
  }

  // 4. 匹配 <html 到 </html>
  const htmlMatch = text.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch) return htmlMatch[0].trim();

  return null;
}

// 更宽松的代码提取（当标准格式失败时）
function extractLooseCode(text: string): string | null {
  // 匹配包含 <canvas 或 <script 的内容
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
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: hidden; background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; }
canvas { display: block; border-radius: 8px; }
</style>
</head>
<body>
${canvas}
${script}
</body>
</html>`;
  }

  // 匹配任何看起来像 HTML 的内容
  const htmlPattern = text.match(/<!(?:DOCTYPE|doctype)[\s\S]*<\/html>/i);
  if (htmlPattern) return htmlPattern[0].trim();

  // 匹配以 < 开头，以 > 结尾的大段内容
  const tagPattern = text.match(/<[a-z][\s\S]{100,}<\/[a-z]>/i);
  if (tagPattern) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>游戏</title>
<style>* { margin: 0; padding: 0; } body { overflow: hidden; }</style>
</head>
<body>
${tagPattern[0]}
</body>
</html>`;
  }

  return null;
}
