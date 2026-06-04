import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// POST — 重置指定学生的对话（删除所有对话和消息）
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const adminCheck = await getVerifiedAdmin(token);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    // 验证目标用户存在
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, name, student_id")
      .eq("id", userId)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json({ error: "学生不存在" }, { status: 404 });
    }

    // 1. 删除该学生的所有消息
    const { error: msgError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", userId);

    if (msgError) {
      console.error("Delete messages error:", msgError);
    }

    // 2. 删除该学生的所有对话
    const { error: convError } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("user_id", userId);

    if (convError) {
      console.error("Delete conversations error:", convError);
    }

    // 3. 删除游戏快照
    await supabaseAdmin
      .from("game_snapshots")
      .delete()
      .eq("user_id", userId);

    // 4. 删除交互事件
    await supabaseAdmin
      .from("interaction_events")
      .delete()
      .eq("user_id", userId);

    // 5. 删除游戏事件
    await supabaseAdmin
      .from("game_events")
      .delete()
      .eq("user_id", userId);

    return NextResponse.json({
      success: true,
      message: `已重置 ${targetUser.name}(${targetUser.student_id}) 的所有对话数据`,
    });
  } catch (err: any) {
    console.error("Reset conversations error:", err);
    return NextResponse.json({ error: err.message || "重置失败" }, { status: 500 });
  }
}
