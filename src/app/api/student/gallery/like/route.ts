import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/deepseek";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST - 点赞/取消点赞
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { conversation_id } = await req.json();
    if (!conversation_id) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

    const db = getSupabaseAdmin();

    // 检查是否已点赞
    const { data: existing } = await db
      .from("gallery_likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("conversation_id", conversation_id)
      .maybeSingle();

    if (existing) {
      // 取消点赞
      await db.from("gallery_likes").delete().eq("id", existing.id);
      return NextResponse.json({ liked: false });
    } else {
      // 点赞
      await db.from("gallery_likes").insert({
        user_id: user.id,
        conversation_id,
      });
      return NextResponse.json({ liked: true });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET - 获取点赞数和当前用户点赞状态
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversation_id");
    if (!conversationId) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

    const db = getSupabaseAdmin();

    const [{ count }, { data: myLike }] = await Promise.all([
      db.from("gallery_likes").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId),
      db.from("gallery_likes").select("id").eq("user_id", user.id).eq("conversation_id", conversationId).maybeSingle(),
    ]);

    return NextResponse.json({ count: count || 0, liked: !!myLike });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
