import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SESSION_GAP_MINUTES = 30; // 间隔超过30分钟视为不同会话

export async function GET(req: NextRequest) {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    // 1. 获取该用户的所有消息（只需要关键字段，避免传输大量 HTML 代码）
    const { data: messages, error: msgError } = await db
      .from("messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // 2. 按时间临近分组
    const sessions: any[] = [];
    let currentSession: any = null;
    let lastTime: Date | null = null;

    for (const msg of messages || []) {
      const msgTime = new Date(msg.created_at);

      // 判断是否应该开启新会话：无当前会话 || 与上条消息间隔超过阈值
      const isNewSession = !currentSession || (
        lastTime && (msgTime.getTime() - lastTime.getTime()) > SESSION_GAP_MINUTES * 60 * 1000
      );

      if (isNewSession) {
        currentSession = {
          session_id: msg.created_at, // 用第一条消息的时间作为 session_id
          message_count: 0,
          first_user_message: "",
          last_message_at: msg.created_at,
          start_time: msg.created_at,
          end_time: msg.created_at,
        };
        sessions.push(currentSession);
      }

      currentSession.message_count++;
      currentSession.last_message_at = msg.created_at;
      currentSession.end_time = msg.created_at;

      // 取第一条用户消息作为标题
      if (msg.role === "user" && !currentSession.first_user_message) {
        currentSession.first_user_message = msg.content?.substring(0, 30) || "";
        if (msg.content?.length > 30) currentSession.first_user_message += "...";
      }

      lastTime = msgTime;
    }

    // 3. 获取用户的项目（游戏作品）
    const { data: projects } = await db
      .from("projects")
      .select("id, game_title, html_code, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // 4. 按时间临近关联游戏到会话
    for (const session of sessions) {
      const sessionStart = new Date(session.start_time).getTime();
      const sessionEnd = new Date(session.end_time).getTime();

      // 找创建时间在会话时间范围内（或会话结束后30分钟内）的项目
      const matchedProject = (projects || []).find((p) => {
        const projTime = new Date(p.created_at).getTime();
        // 项目创建时间在会话开始前5分钟 到 会话结束后30分钟内
        return projTime >= (sessionStart - 5 * 60 * 1000) &&
               projTime <= (sessionEnd + SESSION_GAP_MINUTES * 60 * 1000);
      });

      session.title = session.first_user_message || "新对话";
      session.has_game = !!matchedProject;
      session.game = matchedProject
        ? {
            project_id: matchedProject.id,
            game_title: matchedProject.game_title,
            html_code: matchedProject.html_code,
          }
        : null;
    }

    // 按最后消息时间倒序排列
    sessions.sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("[student/sessions] 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
