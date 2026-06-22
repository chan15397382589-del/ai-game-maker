import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// GET — 获取学生的数据采集（支持年级/班级筛选）
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    const db = getDB();

    // 获取学生（支持筛选）
    let studentQuery = db
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("role", "student")
      .limit(500);
    if (grade) studentQuery = studentQuery.eq("grade", parseInt(grade));
    if (classNum) studentQuery = studentQuery.eq("class_num", parseInt(classNum));

    const { data: students } = await studentQuery;
    const studentIds = (students || []).map((s: any) => s.id);

    if (studentIds.length === 0) {
      return NextResponse.json({
        students: [],
        summary: { total_students: 0, active_students: 0, total_games: 0, total_messages: 0 },
      });
    }

    // 并行获取对话和消息统计
    const [convResult, msgResult] = await Promise.all([
      db.from("conversations").select("user_id, html_code").in("user_id", studentIds).limit(5000),
      db.from("messages").select("user_id, input_method, has_code").in("user_id", studentIds).limit(50000),
    ]);

    const convCountMap: Record<string, number> = {};
    const gameCountMap: Record<string, number> = {};
    (convResult.data || []).forEach((c: any) => {
      convCountMap[c.user_id] = (convCountMap[c.user_id] || 0) + 1;
      if (c.html_code && c.html_code.length > 100) {
        gameCountMap[c.user_id] = (gameCountMap[c.user_id] || 0) + 1;
      }
    });

    const msgCountMap: Record<string, number> = {};
    const inputMethodMap: Record<string, { text: number; voice: number }> = {};
    const hasCodeMap: Record<string, number> = {};
    (msgResult.data || []).forEach((m: any) => {
      msgCountMap[m.user_id] = (msgCountMap[m.user_id] || 0) + 1;
      if (!inputMethodMap[m.user_id]) inputMethodMap[m.user_id] = { text: 0, voice: 0 };
      if (m.input_method === "text") inputMethodMap[m.user_id].text++;
      if (m.input_method === "voice") inputMethodMap[m.user_id].voice++;
      if (m.has_code) hasCodeMap[m.user_id] = (hasCodeMap[m.user_id] || 0) + 1;
    });

    const studentData = (students || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      student_id: s.student_id,
      grade: s.grade,
      class_num: s.class_num,
      conversation_count: convCountMap[s.id] || 0,
      game_count: gameCountMap[s.id] || 0,
      message_count: msgCountMap[s.id] || 0,
      text_input: inputMethodMap[s.id]?.text || 0,
      voice_input: inputMethodMap[s.id]?.voice || 0,
      code_generations: hasCodeMap[s.id] || 0,
    }));

    const summary = {
      total_students: studentData.length,
      active_students: studentData.filter((s: any) => s.message_count > 0).length,
      total_games: Object.values(gameCountMap).reduce((a, b) => a + b, 0),
      total_messages: Object.values(msgCountMap).reduce((a, b) => a + b, 0),
    };

    return NextResponse.json({ students: studentData, summary });
  } catch (error: any) {
    console.error("[tracking] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
