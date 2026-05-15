import { NextRequest, NextResponse } from "next/server";
import { TEACHER_SYSTEM_PROMPT, createChatCompletion, saveMessage } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
  try {
    const { messages, userId, sessionId } = await req.json();
    
    // 从请求头获取 token
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";

    // 保存用户消息到数据库
    if (userId && messages.length > 0 && token) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        await saveMessage(userId, "user", lastMessage.content, token, sessionId);
      }
    }

    const response = await createChatCompletion(messages);

    // 创建流式响应
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let assistantContent = "";

        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          assistantContent += content;
          const data = `data: ${JSON.stringify({ content })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        // 流结束后，保存完整的 AI 回复到数据库
        if (userId && assistantContent && token) {
          await saveMessage(userId, "assistant", assistantContent, token, sessionId);
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
