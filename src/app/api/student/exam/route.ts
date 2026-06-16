import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/supabase-admin";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const db = getDB();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取题目（不含正确答案）和学生已答题目
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const db = getDB();

    // 获取所有题目（不含正确答案）
    const { data: questions, error } = await db
      .from("exam_questions")
      .select("id, question_text, option_a, option_b, option_c, option_d")
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 获取学生已答题目
    const { data: myAnswers } = await db
      .from("exam_answers")
      .select("question_id, selected_answer")
      .eq("user_id", user.id);

    const answeredMap: Record<string, string> = {};
    (myAnswers || []).forEach((a: any) => { answeredMap[a.question_id] = a.selected_answer; });

    return NextResponse.json({
      questions: questions || [],
      answered: answeredMap,
      totalAnswered: Object.keys(answeredMap).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - 提交答案
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const db = getDB();
    const { question_id, selected_answer } = await req.json();

    if (!question_id || !selected_answer) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // 获取正确答案
    const { data: question } = await db
      .from("exam_questions")
      .select("correct_answer")
      .eq("id", question_id)
      .single();

    if (!question) return NextResponse.json({ error: "题目不存在" }, { status: 404 });

    const isCorrect = selected_answer.toUpperCase() === question.correct_answer;

    // 保存答案（如果已答则更新）
    const { data, error } = await db
      .from("exam_answers")
      .upsert({
        user_id: user.id,
        question_id,
        selected_answer: selected_answer.toUpperCase(),
        is_correct: isCorrect,
      }, { onConflict: "user_id,question_id" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      is_correct: isCorrect,
      correct_answer: question.correct_answer,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
