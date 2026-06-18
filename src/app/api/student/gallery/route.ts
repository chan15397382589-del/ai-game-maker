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

    // 获取这些学生的有游戏代码的对话
    const { data: conversations } = await db
      .from("conversations")
      .select("id, user_id, title, html_code, updated_at")
      .in("user_id", classmateIds)
      .not("html_code", "is", null)
      .order("updated_at", { ascending: false })
      .limit(200);

    // 转换为统一格式
    const games = (conversations || [])
      .filter((c: any) => c.html_code && c.html_code.length > 100)
      .map((c: any) => {
        const author = classmateMap[c.user_id];
        return {
          id: c.id,
          user_id: c.user_id,
          game_title: c.title || "未命名游戏",
          html_code: c.html_code,
          author_name: author?.name || "未知",
          author_grade: author?.grade,
          author_class_num: author?.class_num,
          created_at: c.updated_at,
          source: "conversation",
        };
      });

    // 按更新时间排序
    games.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(games);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
