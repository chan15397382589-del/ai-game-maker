import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST — 学生批量上报交互事件
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const db = getDB();
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    const { events } = await req.json();
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "events 不能为空" }, { status: 400 });
    }

    // 限制每次最多上报 50 条
    const batch = events.slice(0, 50);

    // 区分交互事件和游戏事件
    const interactionRows: any[] = [];
    const gameRows: any[] = [];

    for (const evt of batch) {
      const row = {
        user_id: user.id,
        session_id: evt.session_id || null,
        event_type: evt.type,
      };

      if (evt.source === "game") {
        gameRows.push({ ...row, event_data: evt.metadata || {} });
      } else {
        interactionRows.push({ ...row, metadata: evt.metadata || {} });
      }
    }

    // 批量插入
    if (interactionRows.length > 0) {
      await db.from("interaction_events").insert(interactionRows);
    }
    if (gameRows.length > 0) {
      await db.from("game_events").insert(gameRows);
    }

    return NextResponse.json({ ok: true, inserted: batch.length });
  } catch (error: any) {
    console.error("[track] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
