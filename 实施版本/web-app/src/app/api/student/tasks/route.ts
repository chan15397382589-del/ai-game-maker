import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

// 获取当前用户
async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取学生的任务数据（只返回最新一条）
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");

    let query = supabaseAdmin
      .from("student_tasks")
      .select("*")
      .eq("user_id", user.id);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ? [data] : []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - 保存/更新任务数据
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { task_id, design_image, game_rules, game_name, design_reason, discussion_notes, revision_notes, duration_seconds, save_count, undo_count } = body;

    if (!task_id) {
      return NextResponse.json({ error: "缺少task_id" }, { status: 400 });
    }

    // 检查是否已存在
    const { data: existing } = await supabaseAdmin
      .from("student_tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_id", task_id)
      .single();

    const updateData: any = { updated_at: new Date().toISOString() };
    if (design_image !== undefined) updateData.design_image = design_image;
    if (game_rules !== undefined) updateData.game_rules = game_rules;
    if (game_name !== undefined) updateData.game_name = game_name;
    if (design_reason !== undefined) updateData.design_reason = design_reason;
    if (discussion_notes !== undefined) updateData.discussion_notes = discussion_notes;
    if (revision_notes !== undefined) updateData.revision_notes = revision_notes;
    if (duration_seconds !== undefined) updateData.duration_seconds = duration_seconds;
    if (save_count !== undefined) updateData.save_count = save_count;
    if (undo_count !== undefined) updateData.undo_count = undo_count;

    if (existing) {
      // 更新
      const { data, error } = await supabaseAdmin
        .from("student_tasks")
        .update(updateData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    } else {
      // 新建
      const { data, error } = await supabaseAdmin
        .from("student_tasks")
        .insert({
          user_id: user.id,
          task_id,
          ...updateData,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
