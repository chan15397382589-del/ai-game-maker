import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// GET — 获取学生的前测数据（支持年级/班级筛选）
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    const db = getDB();

    // 先获取符合条件的学生ID
    let userQuery = db
      .from("users")
      .select("id")
      .eq("role", "student");
    if (grade) userQuery = userQuery.eq("grade", parseInt(grade));
    if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));

    const { data: filteredUsers } = await userQuery.limit(500);
    const filteredUserIds = (filteredUsers || []).map((u: any) => u.id);

    if (filteredUserIds.length === 0) {
      return NextResponse.json([]);
    }

    // 获取前测数据
    const { data, error } = await db
      .from("student_tasks")
      .select("id, user_id, design_reason, created_at, updated_at, users!inner(name, student_id, grade, class_num)")
      .eq("task_id", "survey")
      .in("user_id", filteredUserIds)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (data || []).map((c: any) => {
      let answers: any = {};
      try { answers = JSON.parse(c.design_reason || "{}"); } catch (err) { console.error(err); }
      return {
        id: c.id,
        user_id: c.user_id,
        student_name: c.users?.name || "未知",
        student_id: c.users?.student_id || "-",
        grade: c.users?.grade,
        class_num: c.users?.class_num,
        q1_gaming: answers.q1 || "",
        q2_programming: answers.q2 || "",
        q3_favorite: answers.q3 || "",
        q4_design: answers.q4 || "",
        q5_good_game: answers.q5 || "",
        skipped: false,
        created_at: c.created_at,
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("[prior-knowledge] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
