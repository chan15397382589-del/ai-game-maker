import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// GET - 获取所有学生的任务数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    // 先获取任务数据（不JOIN用户表，减少查询复杂度）
    let query = supabaseAdmin
      .from("student_tasks")
      .select("id, user_id, task_id, game_name, game_rules, design_reason, design_image, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data: tasks, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 批量获取用户信息
    const userIds = [...new Set((tasks || []).map((t: any) => t.user_id))];
    let userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .in("id", userIds);
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    // 组装结果
    const tasksWithUsers = (tasks || []).map((t: any) => ({
      ...t,
      user: userMap[t.user_id] || null,
    }));

    // 过滤年级班级
    let filtered = tasksWithUsers;
    if (grade) {
      filtered = filtered.filter((t: any) => t.user?.grade === parseInt(grade));
    }
    if (classNum) {
      filtered = filtered.filter((t: any) => t.user?.class_num === parseInt(classNum));
    }

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
