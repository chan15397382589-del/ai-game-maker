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

// GET - 获取班级所有游戏（从 conversations 和 shared_items 合并）
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const db = getDB();

    // 获取当前用户信息
    const { data: myInfo } = await db
      .from("users")
      .select("grade, class_num")
      .eq("id", user.id)
      .single();

    if (!myInfo?.grade) {
      return NextResponse.json([]);
    }

    // 获取同年级学生
    const { data: classmates } = await db
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("grade", myInfo.grade)
      .eq("role", "student");

    const classmateMap: Record<string, any> = {};
    const classmateIds = (classmates || []).map((c: any) => {
      classmateMap[c.id] = c;
      return c.id;
    });

    if (classmateIds.length === 0) return NextResponse.json([]);

    // 获取每个学生最新的一条有游戏代码的对话（只取元数据，不取 html_code）
    // 先查所有有 html_code 的对话 ID
    const { data: allConvs } = await db
      .from("conversations")
      .select("id, user_id, title, updated_at, html_code")
      .in("user_id", classmateIds)
      .not("html_code", "is", null)
      .order("updated_at", { ascending: false })
      .limit(500);

    // 每个学生只保留最新的一条
    const seen = new Set<string>();
    const games: any[] = [];
    for (const c of allConvs || []) {
      if (seen.has(c.user_id)) continue;
      if (!c.html_code || c.html_code.length < 100) continue;
      seen.add(c.user_id);
      const author = classmateMap[c.user_id];
      games.push({
        id: c.id,
        user_id: c.user_id,
        game_title: c.title || "未命名游戏",
        html_code: c.html_code,
        author_name: author?.name || "未知",
        author_grade: author?.grade,
        author_class_num: author?.class_num,
        created_at: c.updated_at,
      });
    }

    // 按更新时间排序
    games.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(games);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
