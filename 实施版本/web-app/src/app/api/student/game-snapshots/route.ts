import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET — 获取当前学生的游戏快照历史
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    let snapshots: any[] = [];
    try {
      const { data } = await supabaseAdmin
        .from("game_snapshots")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      snapshots = data || [];
    } catch (err: any) {
      console.warn("[game-snapshots] 查询失败:", err.message);
    }

    return NextResponse.json(snapshots);
  } catch (error: any) {
    console.error("[game-snapshots] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
