import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    // 强制要求 session_id，防止返回大量无过滤数据
    if (!sessionId) {
      return NextResponse.json({ error: "缺少 session_id 参数" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("id, role, content, created_at, session_id")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(1000);

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
