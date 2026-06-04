import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — 获取所有学生的分类评估数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { data, error } = await db
      .from("student_classifications")
      .select("*, users!inner(name, student_id, grade, class_num)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 格式化返回数据
    const formatted = (data || []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      student_name: c.users?.name || "未知",
      student_id: c.users?.student_id || "-",
      grade: c.users?.grade,
      class_num: c.users?.class_num,
      q1_answers: c.q1_answers || [],
      q2_answer: c.q2_answer || "",
      q3_answer: c.q3_answer || "",
      q1_score: c.q1_score || 0,
      q2_score: c.q2_score || 0,
      q3_score: c.q3_score || 0,
      total_score: c.total_score || 0,
      srl_group: c.srl_group || "low_srl",
      total_time: c.total_time || 0,
      created_at: c.created_at,
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("[classifications] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
