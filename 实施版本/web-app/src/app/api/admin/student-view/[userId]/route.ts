import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — 获取学生完整信息：个人信息、对话列表、游戏快照
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();

    // 获取学生信息
    const { data: student } = await db
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("id", userId)
      .single();

    if (!student) {
      return NextResponse.json({ error: "学生不存在" }, { status: 404 });
    }

    // 获取对话列表（含当前游戏代码）
    const { data: conversations } = await db
      .from("conversations")
      .select("id, title, html_code, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    // 获取每个对话的消息数量
    const convsWithCounts = await Promise.all(
      (conversations || []).map(async (conv: any) => {
        const { count } = await db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("session_id", conv.id);
        return { ...conv, message_count: count || 0, has_game: !!conv.html_code };
      })
    );

    // 获取所有游戏快照（容错处理表不存在的情况）
    let snapshots: any[] = [];
    try {
      const { data } = await db
        .from("game_snapshots")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      snapshots = data || [];
    } catch (err: any) {
      console.warn("[student-view] game_snapshots 查询失败:", err.message);
    }

    // 获取全部消息（用于回放）
    const { data: messages } = await db
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      student,
      conversations: convsWithCounts,
      snapshots: snapshots || [],
      messages: messages || [],
    });
  } catch (error: any) {
    console.error("[student-view] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
