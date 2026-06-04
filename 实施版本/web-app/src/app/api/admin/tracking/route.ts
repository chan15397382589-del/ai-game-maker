import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — 获取所有事件数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // 'interaction' | 'game' | null

    let interactionEvents: any[] = [];
    let gameEvents: any[] = [];

    if (!type || type === "interaction") {
      const { data, error } = await db
        .from("interaction_events")
        .select("*, users!inner(name, student_id, grade, class_num)")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      interactionEvents = (data || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        student_name: c.users?.name || "未知",
        student_id: c.users?.student_id || "-",
        grade: c.users?.grade,
        class_num: c.users?.class_num,
        session_id: c.session_id,
        event_type: c.event_type,
        metadata: c.metadata || {},
        created_at: c.created_at,
      }));
    }

    if (!type || type === "game") {
      const { data, error } = await db
        .from("game_events")
        .select("*, users!inner(name, student_id, grade, class_num)")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      gameEvents = (data || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        student_name: c.users?.name || "未知",
        student_id: c.users?.student_id || "-",
        grade: c.users?.grade,
        class_num: c.users?.class_num,
        session_id: c.session_id,
        event_type: c.event_type,
        event_data: c.event_data || {},
        created_at: c.created_at,
      }));
    }

    // 获取 messages 表中的 input_method 统计
    const { data: msgStats } = await db
      .from("messages")
      .select("input_method, has_code, user_id")
      .not("input_method", "is", null);

    const inputMethodStats = {
      text: 0,
      voice: 0,
      hasCode: 0,
    };

    (msgStats || []).forEach((m: any) => {
      if (m.input_method === "text") inputMethodStats.text++;
      if (m.input_method === "voice") inputMethodStats.voice++;
      if (m.has_code) inputMethodStats.hasCode++;
    });

    return NextResponse.json({
      interactionEvents,
      gameEvents,
      inputMethodStats,
    });
  } catch (error: any) {
    console.error("[tracking] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
