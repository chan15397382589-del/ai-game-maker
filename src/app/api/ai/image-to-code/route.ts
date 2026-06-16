import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/deepseek";
import { chatQueue } from "@/lib/requestQueue";

const mimo = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || "placeholder",
  baseURL: "https://token-plan-sgp.xiaomimimo.com/anthropic",
});

// 将图片URL转为base64
async function imageUrlToBase64(url: string): Promise<string> {
  // 如果已经是base64，直接返回
  if (url.startsWith("data:")) {
    return url.replace(/^data:image\/\w+;base64,/, "");
  }
  // 下载图片并转为base64
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

    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "请提供图片" }, { status: 400 });
    }

    // 将图片转为base64
    const base64Data = await imageUrlToBase64(imageUrl);

    // 第一步：用 MIMO 分析图片，生成详细描述
    const analysisResponse = await chatQueue.add(() => mimo.messages.create({
      model: "mimo-v2.5",
      max_tokens: 1500,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `你是一个专业的游戏UI设计师。请非常详细地分析这张游戏截图，生成一个完整的AI绘图提示词。

要求：
1. 用中文详细描述图片中的所有视觉元素
2. 描述要适合用AI生成类似的网页游戏界面
3. 包含：背景、颜色、布局、角色、UI元素、光影效果、整体风格
4. 最后生成一段完整的英文提示词，用于AI生图

请按以下格式输出：
## 详细描述
（用中文详细描述）

## AI绘图提示词
（用英文写，可以直接用于AI生图）`
            }
          ]
        }
      ]
    }));

    const analysisText = analysisResponse.content[0].type === "text" ? analysisResponse.content[0].text : "";

    // 提取英文提示词
    const promptMatch = analysisText.match(/## AI绘图提示词\s*\n([\s\S]*?)$/);
    const aiPrompt = promptMatch ? promptMatch[1].trim() : analysisText;

    // 第二步：用 MIMO 生成游戏代码
    const codeResponse = await chatQueue.add(() => mimo.messages.create({
      model: "mimo-v2.5",
      max_tokens: 8192,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `分析这张游戏设计图，生成一个完整的单文件 HTML5 网页游戏代码。

要求：
1. 使用 HTML5 Canvas 绘制游戏画面，所有图形都用 Canvas 绘制，不依赖图片文件
2. 用 JavaScript 实现游戏逻辑
3. 游戏元素要匹配图片中的角色、背景、道具
4. 颜色风格要与图片一致
5. 代码要完整可运行
6. **必须有游戏循环**：function gameLoop() { ctx.clearRect(); 更新状态(); 绘制(); requestAnimationFrame(gameLoop); }，并在游戏开始时调用requestAnimationFrame(gameLoop)
7. **输入事件绑定（必须遵守）**：
   - 键盘：document.addEventListener('keydown')，用e.code判断按键
   - 鼠标点击：canvas.addEventListener('click')
   - 触摸：canvas.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false })
   - 事件绑定放在脚本顶层，不要延迟绑定
   - 游戏必须同时支持键盘和触摸操作
8. 添加中文注释说明每个部分
9. 确保代码在 iframe 中能正常运行（不用localStorage、fetch）
10. 不要使用任何外部资源或CDN
11. Canvas使用固定尺寸800x600，body设置margin:0;padding:0;overflow:hidden
12. HTML结构必须完整：<!DOCTYPE html>开头，<html><head><body><canvas><script>齐全，</html>结尾

请直接输出完整的 HTML 游戏代码，用 \`\`\`html ... \`\`\` 包裹。`
            }
          ]
        }
      ]
    }));

    const codeText = codeResponse.content[0].type === "text" ? codeResponse.content[0].text : "";

    // 提取代码块
    const codeMatch = codeText.match(/```html\s*\n([\s\S]*?)```/);
    if (codeMatch) {
      return NextResponse.json({ code: codeMatch[1].trim(), prompt: aiPrompt });
    }

    // 尝试找 HTML 内容
    if (codeText.includes("<!DOCTYPE") || codeText.includes("<html")) {
      const start = codeText.indexOf("<!DOCTYPE") !== -1 ? codeText.indexOf("<!DOCTYPE") : codeText.indexOf("<html");
      const end = codeText.lastIndexOf("</html>");
      if (start !== -1 && end !== -1) {
        return NextResponse.json({ code: codeText.substring(start, end + 7), prompt: aiPrompt });
      }
    }

    return NextResponse.json({ error: "未能生成代码，请重试", prompt: aiPrompt }, { status: 500 });
  } catch (err: any) {
    console.error("Image to code error:", err);
    return NextResponse.json({ error: err.message || "生成失败" }, { status: 500 });
  }
}
