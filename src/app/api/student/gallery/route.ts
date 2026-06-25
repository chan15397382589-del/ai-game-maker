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

    // 获取同班学生（必须同年级同班级）
    if (!myInfo.class_num) {
      return NextResponse.json([]);
    }

    const { data: classmates } = await db
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("grade", myInfo.grade)
      .eq("class_num", myInfo.class_num)
      .eq("role", "student");

    const classmateMap: Record<string, any> = {};
    const classmateIds = (classmates || []).map((c: any) => {
      classmateMap[c.id] = c;
      return c.id;
    });

    if (classmateIds.length === 0) return NextResponse.json([]);

    // 获取所有有游戏代码的对话（需要 html_code 用于截图预览）
    const { data: allConvs } = await db
      .from("conversations")
      .select("id, user_id, title, html_code, updated_at")
      .in("user_id", classmateIds)
      .not("html_code", "is", null)
      .order("updated_at", { ascending: false })
      .limit(200);

    // 获取学生的游戏规则
    const { data: tasks } = await db
      .from("student_tasks")
      .select("user_id, game_rules, game_name")
      .in("user_id", classmateIds)
      .eq("task_id", "1-1");

    const rulesMap: Record<string, any> = {};
    (tasks || []).forEach((t: any) => { rulesMap[t.user_id] = t; });

    // 每个学生只保留最新的一条
    const seen = new Set<string>();
    const games: any[] = [];
    for (const c of allConvs || []) {
      if (seen.has(c.user_id)) continue;
      seen.add(c.user_id);
      const author = classmateMap[c.user_id];
      const task = rulesMap[c.user_id];
      games.push({
        id: c.id,
        user_id: c.user_id,
        game_title: task?.game_name || c.title || "未命名游戏",
        html_code: c.html_code,
        game_rules: task?.game_rules || [],
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
