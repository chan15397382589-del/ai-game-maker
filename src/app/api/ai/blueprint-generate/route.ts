import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/deepseek";

const mimo = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || "placeholder",
  baseURL: "https://token-plan-sgp.xiaomimimo.com/anthropic",
});

async function imageUrlToBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) return url.replace(/^data:image\/\w+;base64,/, "");
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export async function POST(req: NextRequest) {
  try {
    // 验证用户身份
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { imageUrl, gameName, rules } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: "请提供图片" }, { status: 400 });

    const base64Data = await imageUrlToBase64(imageUrl);
    const rulesText = (rules || []).filter((r: string) => r.trim()).map((r: string) => `如果${r}`).join("；");

    // 单次API调用：分析图片 + 生成代码
    const response = await mimo.messages.create({
      model: "mimo-v2.5",
      max_tokens: 8192,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: base64Data } },
            {
              type: "text",
              text: `分析这张游戏设计图，直接生成完整的HTML5网页游戏代码。

游戏名称：${gameName || "未命名游戏"}
${rulesText ? `游戏规则：${rulesText}` : ""}

要求：
1. 直接输出完整HTML代码，用\`\`\`html包裹，以</html>结尾
2. Canvas使用固定尺寸800x600，body设置margin:0;padding:0;overflow:hidden
3. 使用HTML5 Canvas绘制所有图形（不依赖图片文件）
4. 颜色风格匹配图片（扁平化、卡通、明快）
5. 实现基本物理效果（重力、碰撞、反弹）
6. 实现游戏规则（计分、胜负判定）
7. **必须有游戏循环**：function gameLoop() { ctx.clearRect(); 更新状态(); 绘制(); requestAnimationFrame(gameLoop); }，并在游戏开始时调用requestAnimationFrame(gameLoop)
8. **输入事件绑定（必须遵守）**：
   - 键盘：document.addEventListener('keydown')，用e.code判断按键
   - 鼠标点击：canvas.addEventListener('click')
   - 触摸：canvas.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false })
   - 事件绑定放在脚本顶层，不要延迟绑定
9. 添加中文注释
10. 代码在iframe中能正常运行（不用localStorage、fetch）
11. 不使用任何外部资源
12. HTML结构必须完整：<!DOCTYPE html>开头，<html><head><body><canvas><script>齐全

先分析图片中的视觉元素（颜色、位置、尺寸），然后直接生成代码。`
            }
          ]
        }
      ]
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // 提取代码 - 多种格式兼容
    // 1. 匹配 ```html ... ```
    const codeMatch = text.match(/```html\s*\n([\s\S]*?)```/);
    if (codeMatch) {
      return NextResponse.json({ code: codeMatch[1].trim() });
    }

    // 2. 匹配 ``` ... ``` (包含HTML标签)
    const anyFence = text.match(/```\s*\n([\s\S]*?)```/);
    if (anyFence && anyFence[1].includes("<")) {
      return NextResponse.json({ code: anyFence[1].trim() });
    }

    // 3. 匹配 <!DOCTYPE html> 到 </html>
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      const start = text.indexOf("<!DOCTYPE") !== -1 ? text.indexOf("<!DOCTYPE") : text.indexOf("<html");
      const end = text.lastIndexOf("</html>");
      if (start !== -1 && end !== -1) {
        return NextResponse.json({ code: text.substring(start, end + 7).trim() });
      }
    }

    // 4. 匹配 <html 到 </html>（没有 DOCTYPE）
    const htmlMatch = text.match(/<html[\s\S]*<\/html>/i);
    if (htmlMatch) {
      return NextResponse.json({ code: htmlMatch[0].trim() });
    }

    // 5. 匹配包含 <canvas 或 <script 的代码块
    const canvasMatch = text.match(/<(?:canvas|script)[\s\S]*<\/(?:canvas|script)>/i);
    if (canvasMatch) {
      // 包装成完整HTML
      const wrappedCode = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>游戏</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: hidden; background: #1a1a2e; }
canvas { display: block; }
</style>
</head>
<body>
${canvasMatch[0]}
</body>
</html>`;
      return NextResponse.json({ code: wrappedCode });
    }

    return NextResponse.json({ error: "未能生成代码，请重试", debug: text.substring(0, 500) }, { status: 500 });
  } catch (err: any) {
    console.error("Blueprint generate error:", err);
    return NextResponse.json({ error: err.message || "生成失败" }, { status: 500 });
  }
}
