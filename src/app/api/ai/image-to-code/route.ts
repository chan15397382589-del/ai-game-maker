import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/deepseek";
import { chatQueue } from "@/lib/requestQueue";

const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
});

// SSRF 防护：只允许 HTTPS 外部 URL
async function imageUrlToBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    return url.replace(/^data:image\/\w+;base64,/, "");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("只允许 HTTPS 图片链接");
    const hostname = parsed.hostname;
    if (["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"].includes(hostname) ||
        hostname.startsWith("10.") || hostname.startsWith("172.") || hostname.startsWith("192.168.")) {
      throw new Error("不允许访问内网地址");
    }
  } catch (e: any) { throw new Error(`URL验证失败: ${e.message}`); }

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`图片下载失败: ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("图片太大");
  return Buffer.from(buffer).toString("base64");
}

// 代码生成 prompt
const CODE_GEN_PROMPT = `你是一个游戏代码生成器。根据用户的描述生成完整的HTML5游戏。
规则：
1. 输出完整的 <!DOCTYPE html> 到 </html>
2. 使用 Canvas 或 DOM 元素
3. 必须包含键盘/鼠标交互
4. 游戏要有明确的得分或胜负条件
5. 简洁美观，适合小学生玩
6. 只输出代码，不要解释`;

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { imageUrl } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: "请提供图片" }, { status: 400 });

    const base64Data = await imageUrlToBase64(imageUrl);

    // 用 DeepSeek 分析图片并生成代码（DeepSeek 支持视觉）
    const response = await chatQueue.add(() => deepseek.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 8192,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64Data}` },
            },
            {
              type: "text",
              text: "请根据这张设计图生成完整的HTML5游戏代码。直接输出代码，不要解释。",
            },
          ],
        },
      ],
    }));

    const content = response.choices?.[0]?.message?.content || "";
    const codeMatch = content.match(/```html\s*\n?([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : (
      content.includes("<!DOCTYPE") || content.includes("<html") ? content.trim() : ""
    );

    if (!code) {
      return NextResponse.json({ error: "未能生成有效代码", raw: content.substring(0, 200) }, { status: 500 });
    }

    return NextResponse.json({ code, prompt: "根据设计图生成" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
