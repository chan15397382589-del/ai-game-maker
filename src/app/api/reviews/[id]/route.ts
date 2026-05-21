import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
