import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST — 保存学生分类评估结果
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const {
      conversation_id, q1_answers, q2_answer, q3_answer,
      q1_score, q2_score, q3_score, total_score, group, total_time,
    } = await req.json();

    // 先删除旧记录（如果存在）
    await supabaseAdmin
      .from("student_classifications")
      .delete()
      .eq("user_id", user.id);

    const { error } = await supabaseAdmin
      .from("student_classifications")
      .insert({
        user_id: user.id,
        conversation_id: conversation_id || null,
        q1_answers: q1_answers || [],
        q2_answer: q2_answer || "",
        q3_answer: q3_answer || "",
        q1_score: q1_score || 0,
        q2_score: q2_score || 0,
        q3_score: q3_score || 0,
        total_score: total_score || 0,
        srl_group: group || "low_srl",
        total_time: total_time || 0,
      });

    if (error) {
      console.error("[classification] 保存失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[classification] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — 获取学生分类结果
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data } = await supabaseAdmin
      .from("student_classifications")
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
