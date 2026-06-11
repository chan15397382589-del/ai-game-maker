import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

// GET - 获取小组成员的任务数据（需要同组才能查看）
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

    // 如果是查看自己的数据，直接返回
    if (userId === user.id) {
      const { data, error } = await supabaseAdmin
        .from("student_tasks")
        .select("*, user:users!student_tasks_user_id_fkey(name, student_id)")
        .eq("user_id", userId)
        .eq("task_id", taskId)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || {});
    }

    // 查找请求者所在的小组
    const { data: myGroups } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);

    if (!myGroups || myGroups.length === 0) {
      return NextResponse.json({ error: "你还没有加入任何小组" }, { status: 403 });
    }

    const myGroupIds = myGroups.map((g: any) => g.group_id);

    // 检查目标用户是否在同一小组
    const { data: targetGroups } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
      .in("group_id", myGroupIds);

    if (!targetGroups || targetGroups.length === 0) {
      return NextResponse.json({ error: "你和该同学不在同一个小组，无法查看" }, { status: 403 });
    }

    // 验证通过，返回任务数据
    const { data, error } = await supabaseAdmin
      .from("student_tasks")
      .select("*, user:users!student_tasks_user_id_fkey(name, student_id)")
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || {});
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
