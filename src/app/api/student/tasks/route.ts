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

    if (!task_id || typeof task_id !== "string") {
      return NextResponse.json({ error: "缺少task_id" }, { status: 400 });
    }

    // 验证数值字段
    const validateInt = (val: any, max: number) => {
      if (val === undefined) return undefined;
      const num = Number(val);
      if (isNaN(num) || num < 0) return 0;
      if (num > max) return max;
      return Math.floor(num);
    };

    const updateData: any = { updated_at: new Date().toISOString() };
    if (design_image !== undefined && typeof design_image === "string" && design_image.length < 10000000) updateData.design_image = design_image;
    if (game_rules !== undefined && Array.isArray(game_rules) && game_rules.length <= 10) updateData.game_rules = game_rules;
    if (game_name !== undefined && typeof game_name === "string" && game_name.length <= 50) updateData.game_name = game_name;
    if (design_reason !== undefined && typeof design_reason === "string" && design_reason.length <= 10000) updateData.design_reason = design_reason;
    if (discussion_notes !== undefined && typeof discussion_notes === "string" && discussion_notes.length <= 5000) updateData.discussion_notes = discussion_notes;
    if (revision_notes !== undefined && typeof revision_notes === "string" && revision_notes.length <= 5000) updateData.revision_notes = revision_notes;
    if (duration_seconds !== undefined) updateData.duration_seconds = validateInt(duration_seconds, 7200);
    if (save_count !== undefined) updateData.save_count = validateInt(save_count, 10000);
    if (undo_count !== undefined) updateData.undo_count = undo_count;

    // 使用 upsert 避免竞态条件（需要数据库有 unique 约束）
    // 先尝试查询，不存在则插入
    const { data: existing } = await supabaseAdmin
      .from("student_tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_id", task_id)
      .maybeSingle();

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

      if (error) {
        // 如果是唯一约束冲突，说明并发请求已插入，尝试更新
        if (error.code === "23505") {
          const { data: retryData, error: retryError } = await supabaseAdmin
            .from("student_tasks")
            .update(updateData)
            .eq("user_id", user.id)
            .eq("task_id", task_id)
            .select()
            .single();
          if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
          return NextResponse.json(retryData);
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
