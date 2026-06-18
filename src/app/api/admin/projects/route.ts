import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// ==================== GET: 所有作品（含未发布 + 对话中的游戏），支持按年级/班级筛选 ====================
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    // 获取学生列表
    let userQuery = db.from("users").select("id, name, student_id, grade, class_num").eq("role", "student");
    if (grade) userQuery = userQuery.eq("grade", parseInt(grade));
    if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));
    const { data: students } = await userQuery.limit(500);
    const studentMap: Record<string, any> = {};
    const studentIds = (students || []).map((s: any) => { studentMap[s.id] = s; return s.id; });

    // 获取对话中的游戏（每个学生只取最新一条）
    let games: any[] = [];
    if (studentIds.length > 0) {
      const { data: convs } = await db
        .from("conversations")
        .select("id, user_id, title, html_code, updated_at")
        .in("user_id", studentIds)
        .not("html_code", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);

      const seen = new Set<string>();
      for (const c of convs || []) {
        if (seen.has(c.user_id)) continue;
        if (!c.html_code || c.html_code.length < 100) continue;
        seen.add(c.user_id);
        const s = studentMap[c.user_id];
        games.push({
          id: c.id,
          source: "conversation",
          game_title: c.title || "未命名游戏",
          html_code: c.html_code,
          is_published: true,
          created_at: c.updated_at,
          users: s || { name: "未知", student_id: c.user_id },
        });
      }
    }

    return NextResponse.json(games);
  } catch (error: any) {
    console.error("[作品列表] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== PATCH: 切换发布状态 ====================
export async function PATCH(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { id, is_published } = await req.json();

    const { error } = await db
      .from("projects")
      .update({ is_published })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[切换发布状态] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== DELETE: 删除作品 ====================
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { id } = await req.json();

    const { error } = await db.from("projects").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[删除作品] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
