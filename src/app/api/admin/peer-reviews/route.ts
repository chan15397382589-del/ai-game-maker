import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// GET - 管理员获取同伴互评数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    // 获取用户（支持筛选）
    let userQuery = supabaseAdmin
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

    // 获取互评数据
    const { data: reviews, error } = await supabaseAdmin
      .from("peer_reviews")
      .select("id, reviewer_id, reviewee_id, q1_enjoy, q2_suggestion, q3_bug, created_at")
      .in("reviewer_id", filteredUserIds)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 批量获取用户信息
    const userIds = [...new Set([
      ...(reviews || []).map((r: any) => r.reviewer_id),
      ...(reviews || []).map((r: any) => r.reviewee_id),
    ])];
    const userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .in("id", userIds);
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    const result = (reviews || []).map((r: any) => ({
      ...r,
      reviewer: userMap[r.reviewer_id] || null,
      reviewee: userMap[r.reviewee_id] || null,
    }));

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
