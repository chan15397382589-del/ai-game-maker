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

    // 分页获取所有消息（避免单次查询过大）
    let allMessages: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore && page < 50) { // 最多50页 = 50000条
      let query = supabaseAdmin
        .from("messages")
        .select("user_id, role, content, session_id, created_at")
        .order("created_at", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        allMessages.push(...data);
        hasMore = data.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    const messages = allMessages;

    const stripHtmlCode = (content: string): string => {
      return content
        .replace(/```html[\s\S]*?```/g, "[游戏代码]")
        .replace(/```[\s\S]*?```/g, "[代码]")
        .trim();
    };

    // 按学生 → 会话分组，每条消息单独保留
    const studentData = new Map<string, { student: any; sessions: Map<string, { firstTime: string; messages: { role: string; content: string; time: string }[] }> }>();

    (messages || []).forEach((msg: any) => {
      const student = studentMap.get(msg.user_id) || { name: "未知学生", student_id: msg.user_id, grade: null, class_num: null };

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
      // 按时间排序会话（包括没有 session_id 的消息）
      const sortedSessions = Array.from(sessions.entries())
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
