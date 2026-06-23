import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST — 保存前测结果
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { q1_gaming, q2_programming, q3_favorite, skipped } = await req.json();

    const recordData = {
      user_id: user.id,
      q1_gaming: skipped ? null : q1_gaming || null,
      q2_programming: skipped ? null : q2_programming || null,
      q3_favorite: skipped ? null : q3_favorite || null,
      skipped: skipped || false,
    };

    // 先查询是否已存在
    const { data: existing } = await supabaseAdmin
      .from("student_prior_knowledge")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let error;
    if (existing) {
      // 更新
      const result = await supabaseAdmin
        .from("student_prior_knowledge")
        .update(recordData)
        .eq("id", existing.id);
      error = result.error;
    } else {
      // 插入
      const result = await supabaseAdmin
        .from("student_prior_knowledge")
        .insert(recordData);
      error = result.error;
    }

    if (error) {
      console.error("[prior-knowledge] 保存失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[prior-knowledge] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — 检查是否已完成前测
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data } = await supabaseAdmin
      .from("student_prior_knowledge")
      .select("*")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!data) {
      return NextResponse.json({ done: false, data: null });
    }

    return NextResponse.json({ done: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
