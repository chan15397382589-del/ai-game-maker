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

    let query = supabaseAdmin
      .from("student_tasks")
      .select(`
        *,
        user:users!student_tasks_user_id_fkey(id, name, student_id, grade, class_num)
      `);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data: tasks, error } = await query.order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 过滤年级班级
    let filtered = tasks || [];
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
