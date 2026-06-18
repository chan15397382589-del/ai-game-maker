import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// GET — 获取所有学生的数据采集
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();

    // 获取所有学生
    const { data: students } = await db
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("role", "student")
      .limit(500);

    const studentMap: Record<string, any> = {};
    (students || []).forEach((s: any) => { studentMap[s.id] = s; });

    // 获取每个学生的对话数量和消息数量
    const { data: convStats } = await db
      .from("conversations")
      .select("user_id, html_code");

    const convCountMap: Record<string, number> = {};
    const gameCountMap: Record<string, number> = {};
    (convStats || []).forEach((c: any) => {
      convCountMap[c.user_id] = (convCountMap[c.user_id] || 0) + 1;
      if (c.html_code && c.html_code.length > 100) {
        gameCountMap[c.user_id] = (gameCountMap[c.user_id] || 0) + 1;
      }
    });

    // 获取消息统计
    const { data: msgStats } = await db
      .from("messages")
      .select("user_id, role, input_method, has_code")
      .limit(50000);

    const msgCountMap: Record<string, number> = {};
    const inputMethodMap: Record<string, { text: number; voice: number }> = {};
    const hasCodeMap: Record<string, number> = {};

    (msgStats || []).forEach((m: any) => {
      msgCountMap[m.user_id] = (msgCountMap[m.user_id] || 0) + 1;
      if (!inputMethodMap[m.user_id]) inputMethodMap[m.user_id] = { text: 0, voice: 0 };
      if (m.input_method === "text") inputMethodMap[m.user_id].text++;
      if (m.input_method === "voice") inputMethodMap[m.user_id].voice++;
      if (m.has_code) hasCodeMap[m.user_id] = (hasCodeMap[m.user_id] || 0) + 1;
    });

    // 组装每个学生的数据
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

    // 汇总统计
    const summary = {
      total_students: studentData.length,
      active_students: studentData.filter((s: any) => s.message_count > 0).length,
      total_conversations: Object.values(convCountMap).reduce((a, b) => a + b, 0),
      total_games: Object.values(gameCountMap).reduce((a, b) => a + b, 0),
      total_messages: Object.values(msgCountMap).reduce((a, b) => a + b, 0),
      total_text_input: Object.values(inputMethodMap).reduce((a, b) => a + b.text, 0),
      total_voice_input: Object.values(inputMethodMap).reduce((a, b) => a + b.voice, 0),
    };

    return NextResponse.json({ students: studentData, summary });
  } catch (error: any) {
    console.error("[tracking] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
