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

    const { conversation_id, q1_choice, q2_choice } = await req.json();

    const { error } = await supabaseAdmin
      .from("student_classifications")
      .insert({
        user_id: user.id,
        conversation_id: conversation_id || null,
        q1_choice: q1_choice || "",
        q2_choice: q2_choice || "",
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

// GET — 检查学生是否已完成分类评估
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data } = await supabaseAdmin
      .from("student_classifications")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    return NextResponse.json({ done: (data || []).length > 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
