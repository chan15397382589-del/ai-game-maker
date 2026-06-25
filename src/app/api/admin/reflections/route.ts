import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    let userQuery = supabaseAdmin.from("users").select("id").eq("role", "student");
    if (grade) userQuery = userQuery.eq("grade", parseInt(grade));
    if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));
    const { data: students } = await userQuery.limit(500);
    const studentIds = (students || []).map((s: any) => s.id);

    if (studentIds.length === 0) return NextResponse.json([]);

    // 获取有反思的对话
    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id, title, reflection, updated_at")
      .in("user_id", studentIds)
      .not("reflection", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1000);

    // 获取用户信息
    const userIds = [...new Set((convs || []).map((c: any) => c.user_id))];
    const userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users").select("id, name, student_id, grade, class_num").in("id", userIds);
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    const result = (convs || []).map((c: any) => {
      let reflection: any = {};
      try { reflection = JSON.parse(c.reflection || "{}"); } catch {}
      return {
        ...c,
        reflection,
        user: userMap[c.user_id] || null,
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
