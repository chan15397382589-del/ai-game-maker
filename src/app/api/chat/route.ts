import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, createChatCompletion, saveMessage, classifyAiSuggestion } from "@/lib/deepseek";
import { createSingleFlightWrite, formatAssistantFailureRecord } from "@/lib/chat-message-integrity";
import { chatQueue } from "@/lib/requestQueue";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId, currentCode, srlCondition, inputMethod, skipSave } = await req.json();

    // 从请求头获取 token 并验证用户身份
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // 速率限制（每用户每分钟 20 次请求）
    const rateLimitKey = `chat:${token.substring(0, 20)}`;
    const { allowed } = checkRateLimit(rateLimitKey, 20, 60000);
    if (!allowed) {
      return NextResponse.json({ error: "请求太频繁，请稍后再试" }, { status: 429 });
    }

    // 输入验证
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "消息格式错误" }, { status: 400 });
    }
    if (messages.length > 100) {
      return NextResponse.json({ error: "消息数量过多" }, { status: 400 });
    }
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== "string") {
        return NextResponse.json({ error: "消息格式错误" }, { status: 400 });
      }
      if (msg.content.length > 200000) {
        return NextResponse.json({ error: "单条消息过长" }, { status: 400 });
      }
      if (!["user", "assistant", "system"].includes(msg.role)) {
        return NextResponse.json({ error: "消息角色无效" }, { status: 400 });
      }
    }

    // 防止 prompt 注入：过滤掉用户消息中的 system 消息
    // 只允许 user 和 assistant 角色的消息
    const sanitizedMessages = messages.filter((msg: any) => msg.role === "user" || msg.role === "assistant");

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
      // 使用队列控制并发，避免 429 限流
      response = await chatQueue.add(() => createChatCompletion(sanitizedMessages, currentCode, srlCondition));
    } catch (apiError: any) {
      console.error("DeepSeek API call failed:", apiError.message);
      // 学生消息已经落库时，必须为失败的AI请求保留一条可审计记录，
      // 避免形成无法解释的“学生消息后什么都没有”。
      try {
        await saveMessage(
          userId,
          "assistant",
          formatAssistantFailureRecord("AI服务连接失败"),
          token,
          sessionId,
          undefined,
          false,
          "system_error",
        );
      } catch (saveError) {
        console.error("Failed to persist AI connection failure record:", saveError);
      }
      if (apiError.message?.includes("429")) {
        return NextResponse.json({ error: "AI服务繁忙，请稍后重试" }, { status: 429 });
      }
      return NextResponse.json({ error: "AI服务连接失败，请稍后重试" }, { status: 502 });
    }

    // 创建流式响应（带 90 秒超时）
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let assistantContent = "";
        let chunkCount = 0;
        let streamTimeout: NodeJS.Timeout | null = null;
        let streamClosed = false;
        let timedOut = false;
        let timeoutSave: Promise<void> | null = null;

        const enqueue = (payload: string) => {
          if (!streamClosed) controller.enqueue(encoder.encode(payload));
        };
        const closeStream = () => {
          if (!streamClosed) {
            streamClosed = true;
            controller.close();
          }
        };
        const persistAssistantRecord = createSingleFlightWrite(async (content: string, suggestionType?: string) => {
          const hasCode = /```html/i.test(content) || /```[\s\S]*?```/.test(content) || /<!doctype|<html/i.test(content);
          await saveMessage(
            userId,
            "assistant",
            content,
            token,
            sessionId,
            undefined,
            hasCode,
            suggestionType || classifyAiSuggestion(content),
          );
        });

        // 重置超时计时器
        const resetTimeout = () => {
          if (streamTimeout) clearTimeout(streamTimeout);
          streamTimeout = setTimeout(() => {
            timedOut = true;
            console.warn("[chat] SSE stream timeout (90s)");
            timeoutSave = persistAssistantRecord(
              formatAssistantFailureRecord("流式响应中断", assistantContent),
              "system_error",
            ).catch((saveError) => {
              console.error("Failed to persist AI timeout record:", saveError);
            });
            enqueue(`data: ${JSON.stringify({ error: "AI回复超时，请重试" })}\n\n`);
            enqueue("data: [DONE]\n\n");
            closeStream();
          }, 90000);
        };

        resetTimeout();

        try {
          for await (const chunk of response) {
            resetTimeout(); // 收到数据时重置超时
            // OpenAI/DeepSeek 流式格式：chunk.choices[0].delta.content
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              chunkCount++;
              enqueue(`data: ${JSON.stringify({ content })}\n\n`);
            }
          }

          if (timedOut) {
            if (timeoutSave) await timeoutSave;
            return;
          }

          // 流结束后，保存完整的 AI 回复到数据库
          if (assistantContent) {
            await persistAssistantRecord(assistantContent);
          } else {
            console.warn("AI returned empty content after", chunkCount, "chunks. Messages:", JSON.stringify(messages).substring(0, 200));
            await persistAssistantRecord(formatAssistantFailureRecord("AI返回空内容"), "system_error");
            enqueue(`data: ${JSON.stringify({ error: "AI服务暂时无法回复，请稍后重试" })}\n\n`);
          }
        } catch (streamError: any) {
          // 流处理异常时，保留已经生成的全部正文和HTML代码，再追加失败标记。
          console.error("Stream error:", streamError.message, streamError.stack);
          try {
            await persistAssistantRecord(
              formatAssistantFailureRecord("流式响应中断", assistantContent),
              "system_error",
            );
          } catch (saveError) {
            console.error("Failed to persist AI stream failure record:", saveError);
          }
          enqueue(`data: ${JSON.stringify({ error: "AI回复中断，请重试" })}\n\n`);
        } finally {
          if (streamTimeout) clearTimeout(streamTimeout);
        }

        enqueue("data: [DONE]\n\n");
        closeStream();
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
