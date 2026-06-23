import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/supabase-admin";
import { validateComment } from "@/lib/profanity";


// GET — 获取评论列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDB();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    const sharedItemId = parseInt(id);
    if (isNaN(sharedItemId)) {
      return NextResponse.json({ error: "无效的分享ID" }, { status: 400 });
    }

    const { data, error } = await db
      .from("comments")
      .select("*, users(name)")
      .eq("shared_item_id", sharedItemId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const comments = (data || []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      shared_item_id: c.shared_item_id,
      content: c.content,
      created_at: c.created_at,
      author_name: c.users?.name || "未知",
    }));

    return NextResponse.json(comments);
  } catch (error: any) {
    console.error("[comments] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — 发表评论
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDB();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    const sharedItemId = parseInt(id);
    if (isNaN(sharedItemId)) {
      return NextResponse.json({ error: "无效的分享ID" }, { status: 400 });
    }

    const { content } = await req.json();

    // 使用统一的评论验证
    const validation = validateComment(content);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { data, error } = await db
      .from("comments")
      .insert({
        user_id: user.id,
        shared_item_id: sharedItemId,
        content: content.trim(),
      })
      .select("*, users(name)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      user_id: data.user_id,
      shared_item_id: data.shared_item_id,
      content: data.content,
      created_at: data.created_at,
      author_name: (data as any).users?.name || "未知",
    });
  } catch (error: any) {
    console.error("[comments] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
