import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST — 点赞
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

    const { data, error } = await db
      .from("likes")
      .insert({
        user_id: user.id,
        shared_item_id: sharedItemId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "你已经点过赞了" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[like] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — 取消点赞
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

    const sharedItemId = parseInt(id);
    if (isNaN(sharedItemId)) {
      return NextResponse.json({ error: "无效的分享ID" }, { status: 400 });
    }

    const { error } = await db
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("shared_item_id", sharedItemId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[like] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
