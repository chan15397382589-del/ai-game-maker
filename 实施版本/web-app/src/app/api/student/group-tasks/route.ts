import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

// GET - 获取小组成员的任务数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "认证失败" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const taskId = searchParams.get("task_id") || "1-1";

    if (!userId) return NextResponse.json({ error: "缺少user_id" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("student_tasks")
      .select("*, user:users!student_tasks_user_id_fkey(name, student_id)")
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || {});
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
