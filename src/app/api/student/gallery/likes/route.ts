import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/deepseek";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取所有班级作品的点赞数和我点赞了哪些
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const db = getSupabaseAdmin();

    // 获取用户所在班级的作品
    const { data: myInfo } = await db.from("users").select("grade, class_num").eq("id", user.id).single();
    if (!myInfo?.grade || !myInfo?.class_num) return NextResponse.json({});

    const { data: classmates } = await db
      .from("users").select("id").eq("grade", myInfo.grade)
      .eq("class_num", myInfo.class_num).eq("role", "student");
    const classmateIds = (classmates || []).map((c: any) => c.id);
    if (classmateIds.length === 0) return NextResponse.json({});

    const { data: convs } = await db
      .from("conversations").select("id").in("user_id", classmateIds)
      .not("html_code", "is", null).order("updated_at", { ascending: false }).limit(500);
    const convIds = (convs || []).map((c: any) => c.id);

    // 批量获取点赞数和我的点赞
    const [{ data: allLikes }, { data: myLikes }] = await Promise.all([
      db.from("gallery_likes").select("conversation_id").in("conversation_id", convIds),
      db.from("gallery_likes").select("conversation_id").eq("user_id", user.id).in("conversation_id", convIds),
    ]);

    const countMap: Record<string, number> = {};
    const myLikeSet = new Set((myLikes || []).map((l: any) => l.conversation_id));
    (allLikes || []).forEach((l: any) => {
      countMap[l.conversation_id] = (countMap[l.conversation_id] || 0) + 1;
    });

    const result: Record<string, { count: number; liked: boolean }> = {};
    convIds.forEach((id: string) => {
      result[id] = { count: countMap[id] || 0, liked: myLikeSet.has(id) };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
