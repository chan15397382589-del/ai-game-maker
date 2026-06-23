import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


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

    // 批量获取所有对话的消息数量（避免 N+1 查询）
    const convIds = (conversations || []).map((c: any) => c.id);
    let messageCountMap: Record<string, number> = {};
    if (convIds.length > 0) {
      const { data: allMessages } = await db
        .from("messages")
        .select("session_id")
        .in("session_id", convIds);
      (allMessages || []).forEach((m: any) => {
        messageCountMap[m.session_id] = (messageCountMap[m.session_id] || 0) + 1;
      });
    }

    const convsWithCounts = (conversations || []).map((conv: any) => ({
      ...conv,
      message_count: messageCountMap[conv.id] || 0,
      has_game: !!conv.html_code,
    }));

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
      .order("created_at", { ascending: true })
      .limit(2000);

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
