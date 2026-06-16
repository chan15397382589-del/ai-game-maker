import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";

// GET - 获取所有题目
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { data, error } = await db
      .from("exam_questions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - 添加新题目
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { question_text, option_a, option_b, option_c, option_d, correct_answer } = await req.json();

    if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
      return NextResponse.json({ error: "请填写完整题目信息" }, { status: 400 });
    }

    const { data, error } = await db
      .from("exam_questions")
      .insert({
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_answer: correct_answer.toUpperCase(),
        created_by: admin.userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - 删除题目
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { id } = await req.json();

    if (!id) return NextResponse.json({ error: "缺少题目ID" }, { status: 400 });

    const { error } = await db.from("exam_questions").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
