import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — 获取所有学生的前测数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { data, error } = await db
      .from("student_prior_knowledge")
      .select("*, users!inner(name, student_id, grade, class_num)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (data || []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      student_name: c.users?.name || "未知",
      student_id: c.users?.student_id || "-",
      grade: c.users?.grade,
      class_num: c.users?.class_num,
      q1_gaming: c.q1_gaming || "",
      q2_programming: c.q2_programming || "",
      q3_favorite: c.q3_favorite || "",
      skipped: c.skipped || false,
      created_at: c.created_at,
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("[prior-knowledge] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
