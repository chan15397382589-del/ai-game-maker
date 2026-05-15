import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    const startTime = searchParams.get("start_time");
    const endTime = searchParams.get("end_time");

    let query = db
      .from("messages")
      .select("*")
      .eq("user_id", user.id);

    // 按 session_id 过滤（适用于新消息）
    if (sessionId) {
      query = query
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
    }
    // 按时间范围过滤（适用于旧消息的时间分组）
    else if (startTime && endTime) {
      query = query
        .gte("created_at", startTime)
        .lte("created_at", endTime)
        .order("created_at", { ascending: true });
    }
    // 未指定过滤条件，返回所有消息（时间倒序）
    else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error("[student/messages] 查询失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[student/messages] 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
