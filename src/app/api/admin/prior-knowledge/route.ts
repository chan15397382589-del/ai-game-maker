import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// GET — 获取所有学生的前测数据（从 student_tasks 表读取 task_id='survey'）
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { data, error } = await db
      .from("student_tasks")
      .select("id, user_id, design_reason, created_at, updated_at, users!inner(name, student_id, grade, class_num)")
      .eq("task_id", "survey")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (data || []).map((c: any) => {
      let answers: any = {};
      try { answers = JSON.parse(c.design_reason || "{}"); } catch {}
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
