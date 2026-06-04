import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// POST — 清理包含特定内容的消息
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const adminCheck = await getVerifiedAdmin(token);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    // 删除包含重试提示的消息
    const { count, error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("role", "user")
      .like("content", "请基于以下当前游戏代码进行修改%")
      .select("id");

    if (error) {
      console.error("Cleanup error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: count || 0,
      message: `已清理 ${count || 0} 条内部重试消息`,
    });
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return NextResponse.json({ error: err.message || "清理失败" }, { status: 500 });
  }
}
