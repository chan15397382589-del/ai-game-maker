import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/deepseek";

// 豆包文生图 API (火山引擎 Ark)
const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const ARK_API_KEY = process.env.ARK_API_KEY || "";

const deepseekAI = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "placeholder",
});

// 用 DeepSeek 分析图片生成 HTML/CSS 代码
export async function imageToCode(imageUrl: string): Promise<string> {
  try {
    const response = await deepseekAI.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
            {
              type: "text",
              text: "请详细描述这张设计图的内容和布局。分析后生成对应的HTML/CSS代码。",
            },
          ],
        },
      ],
    });

    return response.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    console.error("Image to code error:", err.message);
    return "";
  }
}

// 优化游戏提示词
async function refinePrompt(rawPrompt: string): Promise<string> {
  try {
    const response = await deepseekAI.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: "你是游戏设计专家。将用户的原始描述优化为简洁清晰的游戏画面提示词，用于AI文生图。返回优化后的英文提示词。",
        },
        { role: "user", content: rawPrompt },
      ],
    });
    return response.choices?.[0]?.message?.content || rawPrompt;
  } catch {
    return rawPrompt;
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { prompt, size } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "请提供描述" }, { status: 400 });
    }

    if (!ARK_API_KEY) {
      return NextResponse.json({ error: "图片生成服务未配置" }, { status: 500 });
    }

    // 优化提示词
    const refinedPrompt = await refinePrompt(prompt);

    // 调用豆包文生图 API
    const imageResponse = await fetch(ARK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "doubao-seedream-4-0-250828",
        prompt: refinedPrompt,
        size: size || "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!imageResponse.ok) {
      const err = await imageResponse.json().catch(() => ({}));
      return NextResponse.json({ error: (err as any).error?.message || `API错误: ${imageResponse.status}` }, { status: 502 });
    }

    const data = await imageResponse.json();
    const base64Image = (data as any).data?.[0]?.b64_json || "";

    if (!base64Image) {
      return NextResponse.json({ error: "未能生成图片" }, { status: 500 });
    }

    return NextResponse.json({
      image: `data:image/png;base64,${base64Image}`,
      prompt: refinedPrompt,
    });
  } catch (err: any) {
    console.error("Generate image error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
