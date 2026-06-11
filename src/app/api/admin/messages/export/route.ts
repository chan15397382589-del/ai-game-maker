import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

// 导出对话记录（每条消息单独一列），用于 Excel 横向编排导出
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // 获取学生信息
    const { data: students } = await supabaseAdmin
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("role", "student");

    const studentMap = new Map<string, any>();
    (students || []).forEach((s: any) => studentMap.set(s.id, s));

    // 获取消息（限制数量，避免资源耗尽）
    let query = supabaseAdmin
      .from("messages")
      .select("user_id, role, content, session_id, created_at")
      .order("created_at", { ascending: true })
      .limit(50000); // 限制最多50000条消息

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    const stripHtmlCode = (content: string): string => {
      return content
        .replace(/```html[\s\S]*?```/g, "[游戏代码]")
        .replace(/```[\s\S]*?```/g, "[代码]")
        .trim();
    };

    // 按学生 → 会话分组，每条消息单独保留
    const studentData = new Map<string, { student: any; sessions: Map<string, { firstTime: string; messages: { role: string; content: string; time: string }[] }> }>();

    (messages || []).forEach((msg: any) => {
      const student = studentMap.get(msg.user_id);
      if (!student) return;

      const uid = msg.user_id;
      const sid = msg.session_id || "__no_session__";

      if (!studentData.has(uid)) {
        studentData.set(uid, { student, sessions: new Map() });
      }
      const sd = studentData.get(uid)!;
      if (!sd.sessions.has(sid)) {
        sd.sessions.set(sid, { firstTime: msg.created_at, messages: [] });
      }
      sd.sessions.get(sid)!.messages.push({
        role: msg.role,
        content: stripHtmlCode(msg.content || ""),
        time: msg.created_at,
      });
    });

    // 构建导出数据
    const result: any[] = [];

    studentData.forEach(({ student, sessions }, uid) => {
      // 按时间排序会话
      const sortedSessions = Array.from(sessions.entries())
        .filter(([sid]) => sid !== "__no_session__")
        .sort((a, b) => new Date(a[1].firstTime).getTime() - new Date(b[1].firstTime).getTime());

      if (sortedSessions.length === 0) return;

      const firstTime = new Date(sortedSessions[0][1].firstTime).toLocaleString("zh-CN");

      // 将所有会话的消息合并为一条时间线（每条消息单独保留）
      const allTurns: { role: string; content: string }[] = [];
      sortedSessions.forEach(([, s]) => {
        s.messages.forEach((m: any) => {
          allTurns.push({ role: m.role === "user" ? "学生" : "AI老师", content: m.content });
        });
      });

      result.push({
        student_name: student.name,
        student_id: student.student_id,
        grade: student.grade ?? "",
        class_num: student.class_num ?? "",
        first_time: firstTime,
        turns: allTurns,
      });
    });

    result.sort((a, b) => {
      if (a.grade !== b.grade) return (a.grade || 0) - (b.grade || 0);
      if (a.class_num !== b.class_num) return (a.class_num || 0) - (b.class_num || 0);
      return a.student_id.localeCompare(b.student_id);
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[导出对话] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
