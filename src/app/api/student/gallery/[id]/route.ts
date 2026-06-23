import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/supabase-admin";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const db = getDB();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取单个游戏的完整代码（需验证同班）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { id } = await params;
    const db = getDB();

    // 获取对话信息
    const { data: conv, error } = await db
      .from("conversations")
      .select("id, user_id, title, html_code")
      .eq("id", id)
      .single();

    if (error || !conv || !conv.html_code) {
      return NextResponse.json({ error: "游戏不存在" }, { status: 404 });
    }

    // 验证同班
    const [myInfo, authorInfo] = await Promise.all([
      db.from("users").select("grade, class_num").eq("id", user.id).single(),
      db.from("users").select("grade, class_num").eq("id", conv.user_id).single(),
    ]);

    if (myInfo.data && authorInfo.data) {
      if (myInfo.data.grade !== authorInfo.data.grade || myInfo.data.class_num !== authorInfo.data.class_num) {
        return NextResponse.json({ error: "无权访问" }, { status: 403 });
      }
    }

    return NextResponse.json({
      id: conv.id,
      game_title: conv.title || "未命名游戏",
      html_code: conv.html_code,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
