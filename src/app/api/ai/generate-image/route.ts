import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/deepseek";

// 豆包文生图 API (火山引擎 Ark)
const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const ARK_API_KEY = process.env.ARK_API_KEY || "";

// MIMO 客户端
const mimo = new Anthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || "https://token-plan-sgp.xiaomimimo.com/anthropic",
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || "placeholder",
});

// 用 MIMO 分析图片生成 HTML/CSS 代码
export async function imageToCode(imageUrl: string): Promise<string> {
  try {
    const response = await mimo.messages.create({
      model: "mimo-v2.5-pro",
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `分析这张游戏设计图，生成一个完整的单文件 HTML5 网页游戏代码。

要求：
1. 使用 HTML5 Canvas 绘制游戏画面
2. 用 JavaScript 实现游戏逻辑
3. 游戏元素要匹配图片中的角色、背景、道具
4. 颜色风格要与图片一致
5. 代码要完整可运行，包含在 \`\`\`html ... \`\`\` 代码块中
6. 游戏要有基本的交互（键盘/鼠标控制）
7. 添加中文注释说明每个部分
8. 确保代码在 iframe 中能正常运行
9. 不要使用任何外部资源或CDN
10. 所有图形都用 Canvas 绘制，不依赖图片文件

请直接输出完整的游戏代码。`
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: imageUrl.replace(/^data:image\/\w+;base64,/, "")
              }
            }
          ]
        }
      ]
    });

    const text = response.content[0];
    if (text.type === "text") {
      // 提取代码块
      const codeMatch = text.text.match(/```html\s*\n([\s\S]*?)```/);
      if (codeMatch) return codeMatch[1].trim();
      return text.text;
    }
    return "";
  } catch (err: any) {
    console.error("MIMO image-to-code error:", err);
    return "";
  }
}

// 用 MIMO 润色提示词
async function refinePrompt(userPrompt: string): Promise<string> {
  try {
    const response = await mimo.messages.create({
      model: "mimo-v2.5-pro",
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: `你是一个网页游戏UI设计专家。请将以下游戏画面描述润色为适合AI生图的英文提示词。

严格要求：
1. 必须是2D网页游戏界面，不是3D游戏
2. 必须是可以通过HTML5 Canvas/CSS实现的画面
3. 使用扁平化设计风格（flat design），不要写实风格
4. 游戏元素要简单：矩形/圆形的角色、简单的背景、清晰的UI按钮
5. 颜色明快鲜艳，适合小学生
6. 不要出现复杂的3D效果、光影、粒子特效
7. 画面中绝对不要出现任何文字、数字、字母、汉字
8. 只输出提示词，不要解释

用户描述：${userPrompt}`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type === "text") {
      return text.text.trim();
    }
    return userPrompt;
  } catch {
    return userPrompt;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 验证用户身份
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "请输入描述内容" }, { status: 400 });
    }

    // 第一步：用 MIMO 润色提示词
    const refinedPrompt = await refinePrompt(prompt);

    // 第二步：用豆包生成图片（使用b64_json格式，避免临时URL过期）
    const response = await fetch(ARK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "doubao-seedream-4-5-251128",
        prompt: refinedPrompt,
        sequential_image_generation: "disabled",
        response_format: "b64_json",
        size: "2560x1440",
        stream: false,
        watermark: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Ark API error:", JSON.stringify(data));
      return NextResponse.json({ error: data.error?.message || data.msg || "AI绘图服务暂时不可用" }, { status: response.status });
    }

    if (data.data && data.data[0] && data.data[0].b64_json) {
      // 返回base64 data URI，永久有效，不会过期
      const dataUri = `data:image/png;base64,${data.data[0].b64_json}`;
      return NextResponse.json({ image: dataUri, prompt: refinedPrompt });
    }

    // 兼容：如果API返回了url格式（回退），也尝试使用
    if (data.data && data.data[0] && data.data[0].url) {
      console.warn("Ark API returned URL instead of b64_json, URL may expire");
      return NextResponse.json({ image: data.data[0].url, prompt: refinedPrompt });
    }

    return NextResponse.json({ error: "未返回图片" }, { status: 500 });
  } catch (err: any) {
    console.error("Generate image error:", err);
    return NextResponse.json({ error: err.message || "生成失败" }, { status: 500 });
  }
}
