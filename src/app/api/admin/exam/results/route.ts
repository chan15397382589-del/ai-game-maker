import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";

// GET - 获取所有学生的测试成绩
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();

    // 获取所有题目
    const { data: questions } = await db
      .from("exam_questions")
      .select("id, question_text, correct_answer");

    const totalQuestions = questions?.length || 0;

    // 获取所有学生的答案
    const { data: answers } = await db
      .from("exam_answers")
      .select("user_id, question_id, selected_answer, is_correct");

    // 获取学生信息
    const userIds = [...new Set((answers || []).map((a: any) => a.user_id))];
    const { data: students } = await db
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .in("id", userIds.length > 0 ? userIds : ["none"]);

    const studentMap: Record<string, any> = {};
    (students || []).forEach((s: any) => { studentMap[s.id] = s; });

    // 按学生分组计算得分
    const studentResults: Record<string, { student: any; answers: any[]; score: number }> = {};

    (answers || []).forEach((a: any) => {
      if (!studentResults[a.user_id]) {
        studentResults[a.user_id] = {
          student: studentMap[a.user_id] || { name: "未知", student_id: a.user_id },
          answers: [],
          score: 0,
        };
      }
      studentResults[a.user_id].answers.push(a);
      if (a.is_correct) studentResults[a.user_id].score++;
    });

    const results = Object.values(studentResults).map((r) => ({
      ...r.student,
      score: r.score,
      total: totalQuestions,
      percentage: totalQuestions > 0 ? Math.round((r.score / totalQuestions) * 100) : 0,
      answered: r.answers.length,
    }));

    results.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

    return NextResponse.json({
      questions: questions || [],
      results,
      totalQuestions,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
