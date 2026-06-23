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

    const errors: string[] = [];

    // 1. 删除该学生的所有消息
    const { error: msgError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", userId);
    if (msgError) errors.push("消息: " + msgError.message);

    // 2. 删除该学生的所有对话
    const { error: convError } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("user_id", userId);
    if (convError) errors.push("对话: " + convError.message);

    // 3. 删除游戏快照
    const { error: snapError } = await supabaseAdmin
      .from("game_snapshots")
      .delete()
      .eq("user_id", userId);
    if (snapError) errors.push("快照: " + snapError.message);

    // 4. 删除交互事件
    const { error: intError } = await supabaseAdmin
      .from("interaction_events")
      .delete()
      .eq("user_id", userId);
    if (intError) errors.push("交互事件: " + intError.message);

    // 5. 删除游戏事件
    const { error: gameError } = await supabaseAdmin
      .from("game_events")
      .delete()
      .eq("user_id", userId);
    if (gameError) errors.push("游戏事件: " + gameError.message);

    if (errors.length > 0) {
      console.error("[reset-conversations] 部分删除失败:", errors);
      return NextResponse.json({
        success: false,
        errors,
        message: `重置 ${targetUser.name} 时部分操作失败`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `已重置 ${targetUser.name}(${targetUser.student_id}) 的所有对话数据`,
    });
  } catch (err: any) {
    console.error("Reset conversations error:", err);
    return NextResponse.json({ error: err.message || "重置失败" }, { status: 500 });
  }
}
