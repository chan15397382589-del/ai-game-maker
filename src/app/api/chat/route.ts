import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, createChatCompletion, saveMessage } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId, currentCode, group } = await req.json();

    // 从请求头获取 token 并验证用户身份（不信任客户端传入的 userId）
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    // 使用从 token 解析的真实 userId
    const userId = user.id;

    // 保存用户消息到数据库
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        await saveMessage(userId, "user", lastMessage.content, token, sessionId);
      }
    }

    const response = await createChatCompletion(messages, currentCode, group);

    // 创建流式响应
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let assistantContent = "";

        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || "";
            assistantContent += content;
            const data = `data: ${JSON.stringify({ content })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }

          // 流结束后，保存完整的 AI 回复到数据库
          if (assistantContent) {
            await saveMessage(userId, "assistant", assistantContent, token, sessionId);
          }
        } catch (streamError: any) {
          // 流处理异常，发送错误事件后关闭
          console.error("Stream error:", streamError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI 回复中断" })}\n\n`));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "服务器错误" },
      { status: 500 }
    );
  }
}
