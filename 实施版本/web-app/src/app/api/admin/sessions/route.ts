import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

const SESSION_GAP_MINUTES = 30;

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "缺少 user_id" }, { status: 400 });
    }

    // 获取该学生的所有消息
    const { data: messages, error: msgError } = await db
      .from("messages")
      .select("id, role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (msgError) throw msgError;

    // 按时间临近分组
    const sessions: any[] = [];
    let currentSession: any = null;
    let lastTime: Date | null = null;

    for (const msg of messages || []) {
      const msgTime = new Date(msg.created_at);
      const isNewSession = !currentSession || (
        lastTime && (msgTime.getTime() - lastTime.getTime()) > SESSION_GAP_MINUTES * 60 * 1000
      );

      if (isNewSession) {
        currentSession = {
          session_id: msg.created_at,
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

      if (msg.role === "user" && !currentSession.first_user_message) {
        currentSession.first_user_message = msg.content?.substring(0, 30) || "";
        if (msg.content?.length > 30) currentSession.first_user_message += "...";
      }
      lastTime = msgTime;
    }

    sessions.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("[admin/sessions] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
