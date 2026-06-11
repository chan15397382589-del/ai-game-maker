import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
1. 直接输出完整HTML代码，用\`\`\`html包裹
2. 画布全屏：Canvas使用width="100%" height="100%"铺满页面，body设置margin:0;padding:0;overflow:hidden
3. 使用HTML5 Canvas绘制所有图形（不依赖图片文件）
4. 颜色风格匹配图片（扁平化、卡通、明快）
5. 实现基本物理效果（重力、碰撞、反弹）
6. 实现游戏规则（计分、胜负判定）
7. 添加Play/Pause控制
8. 添加键盘控制
9. 添加中文注释
10. 代码在iframe中能正常运行
11. 不使用任何外部资源

先分析图片中的视觉元素（颜色、位置、尺寸），然后直接生成代码。`
            }
          ]
        }
      ]
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // 提取代码
    const codeMatch = text.match(/```html\s*\n([\s\S]*?)```/);
    if (codeMatch) {
      return NextResponse.json({ code: codeMatch[1].trim() });
    }

    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      const start = text.indexOf("<!DOCTYPE") !== -1 ? text.indexOf("<!DOCTYPE") : text.indexOf("<html");
      const end = text.lastIndexOf("</html>");
      if (start !== -1 && end !== -1) {
        return NextResponse.json({ code: text.substring(start, end + 7) });
      }
    }

    return NextResponse.json({ error: "未能生成代码，请重试" }, { status: 500 });
  } catch (err: any) {
    console.error("Blueprint generate error:", err);
    return NextResponse.json({ error: err.message || "生成失败" }, { status: 500 });
  }
}
