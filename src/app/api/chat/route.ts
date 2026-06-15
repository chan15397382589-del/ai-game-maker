import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, createChatCompletion, saveMessage, classifyAiSuggestion } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId, currentCode, srlCondition, inputMethod, skipSave } = await req.json();

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

    // 保存用户消息到数据库（skipSave=true 时不保存，用于静默重试）
    if (!skipSave && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        await saveMessage(userId, "user", lastMessage.content, token, sessionId, inputMethod);
      }
    }

    let response;
    try {
      response = await createChatCompletion(messages, currentCode, srlCondition);
    } catch (apiError: any) {
      console.error("MIMO API call failed:", apiError.message);
      return NextResponse.json({ error: "AI服务连接失败：" + apiError.message }, { status: 502 });
    }

    // 创建流式响应
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let assistantContent = "";
        let chunkCount = 0;

        try {
          for await (const event of response) {
            // 处理文本内容
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              const content = event.delta.text;
              assistantContent += content;
              chunkCount++;
              const data = `data: ${JSON.stringify({ content })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            // 也处理 thinking 内容（如果只有 thinking 没有 text，也记录）
            if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
              // thinking 内容不发送给前端，但计入 chunkCount 避免误判为空
              chunkCount++;
            }
          }

          // 流结束后，保存完整的 AI 回复到数据库
          if (assistantContent) {
            const hasCode = /```html/i.test(assistantContent) || /```[\s\S]*?```/.test(assistantContent);
            const aiSuggestionType = classifyAiSuggestion(assistantContent);
            await saveMessage(userId, "assistant", assistantContent, token, sessionId, undefined, hasCode, aiSuggestionType);
          } else if (chunkCount > 0) {
            // 有 thinking 内容但没有 text 内容，AI 可能在内部推理但没输出
            // 发送一个默认回复而不是错误
            const fallbackContent = "  让我想想...请再说一次你的想法？";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallbackContent })}\n\n`));
            await saveMessage(userId, "assistant", fallbackContent, token, sessionId);
          } else {
            console.warn("AI returned empty content after", chunkCount, "chunks. Messages:", JSON.stringify(messages).substring(0, 200));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI服务暂时无法回复，请稍后重试" })}\n\n`));
          }
        } catch (streamError: any) {
          // 流处理异常，发送错误事件后关闭
          console.error("Stream error:", streamError.message, streamError.stack);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI回复中断：" + streamError.message })}\n\n`));
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
