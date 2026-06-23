import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/supabase-admin";


// GET — 获取单个分享详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const db = getDB();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    // 获取分享详情（含作者信息）
    const { data: item, error } = await db
      .from("shared_items")
      .select("*, author:users!shared_items_user_id_fkey(name, grade, class_num)")
      .eq("id", id)
      .single();

    if (error || !item) return NextResponse.json({ error: "作品不存在" }, { status: 404 });

    // 获取点赞数
    const { count: likeCount } = await db
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("shared_item_id", id);

    // 是否已点赞
    const { data: myLike } = await db
      .from("likes")
      .select("id")
      .eq("shared_item_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    // 评论数
    const { count: commentCount } = await db
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("shared_item_id", id);

    return NextResponse.json({
      ...item,
      author_name: item.author?.name || "匿名",
      author_grade: item.author?.grade || null,
      author_class_num: item.author?.class_num || null,
      like_count: likeCount || 0,
      liked_by_me: !!myLike,
      comment_count: commentCount || 0,
      is_mine: item.user_id === user.id,
    });
  } catch (error: any) {
    console.error("[reviews/id] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — 撤回分享（仅本人）
export async function DELETE(
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

    const { data: item } = await db
      .from("shared_items")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!item) {
      return NextResponse.json({ error: "分享不存在" }, { status: 404 });
    }

    if (item.user_id !== user.id) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    // 先删除关联的评论和点赞
    await db.from("comments").delete().eq("shared_item_id", id);
    await db.from("likes").delete().eq("shared_item_id", id);

    // 再删除作品
    const { error } = await db
      .from("shared_items")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[reviews/id] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
