import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

// 自动检测 AI 行为码
function detectAICode(content: string, prevStudentText: string): string {
  const c = content || "";

  // AI-1: 提供设计建议（含列举选项）
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(c) || /\n\s*[1-9][.、]\s/.test(c) || /[A-E][.、)）]/.test(c)) {
    return "AI-1";
  }

  // AI-2: 直接生成代码
  if (/```html/i.test(c) || /```[\s\S]{100,}```/.test(c)) {
    return "AI-2";
  }

  // AI-7: SRL 提示（元认知引导关键词）
  if (/先想想|一步一步来|我们检查一下|想想看|先想一想/.test(c)) {
    return "AI-7";
  }

  // AI-6: 引导调试
  if (/你试一下|试一试|看看.*对不对|是不是因为|我们来检查|检查一下|看看效果/.test(c)) {
    return "AI-6";
  }

  // AI-3: 追问引导（以问号结尾或包含引导性问句）
  const questionCount = (c.match(/[?？]/g) || []).length;
  if (questionCount >= 1 && (c.trim().endsWith("?") || c.trim().endsWith("？") || /你觉得|你想|你想先/.test(c))) {
    return "AI-3";
  }

  // AI-5: 评价反馈
  if (/这个想法很好|不错|建议你|但是|不过我觉得|挺好的|很棒/.test(c) && !/```/.test(c)) {
    return "AI-5";
  }

  // AI-4: 确认/总结
  if (/好的.*我来|你要的是|明白了.*做|好的.*帮你|收到/.test(c)) {
    return "AI-4";
  }

  return "";
}

// 压缩 AI 回复为摘要
function summarizeAI(content: string): string {
  let text = content
    .replace(/```html[\s\S]*?```/g, "[生成代码]")
    .replace(/```[\s\S]*?```/g, "[代码]")
    .replace(/\n{3,}/g, "\n")
    .trim();
  // 截取前200字
  if (text.length > 200) text = text.slice(0, 200) + "...";
  return text;
}

// 导出编码表格式
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // 1. 获取学生信息
    const { data: students } = await supabaseAdmin
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("role", "student");

    const studentMap = new Map<string, any>();
    (students || []).forEach((s: any) => studentMap.set(s.id, s));

    // 2. 获取学生 SRL 分组
    const { data: classifications } = await supabaseAdmin
      .from("student_classifications")
      .select("user_id, srl_group");

    const srlMap = new Map<string, string>();
    (classifications || []).forEach((c: any) => srlMap.set(c.user_id, c.srl_group));

    // 3. 获取消息（限制数量，避免资源耗尽）
    let msgQuery = supabaseAdmin
      .from("messages")
      .select("user_id, role, content, session_id, created_at, input_method")
      .order("created_at", { ascending: true })
      .limit(50000);

    if (userId) msgQuery = msgQuery.eq("user_id", userId);

    const { data: messages, error: msgError } = await msgQuery;
    if (msgError) throw msgError;

    // 4. 获取交互事件（用于补充 notes，限制数量）
    let evtQuery = supabaseAdmin
      .from("interaction_events")
      .select("user_id, session_id, event_type, metadata, created_at")
      .limit(50000);

    if (userId) evtQuery = evtQuery.eq("user_id", userId);

    const { data: events } = await evtQuery;

    // 按 session_id 分组事件
    const eventsBySession = new Map<string, any[]>();
    (events || []).forEach((e: any) => {
      const key = `${e.user_id}_${e.session_id || "none"}`;
      if (!eventsBySession.has(key)) eventsBySession.set(key, []);
      eventsBySession.get(key)!.push(e);
    });

    // 5. 按学生 → 会话分组消息，然后配对 turn
    const studentSessions = new Map<string, Map<string, any[]>>();

    (messages || []).forEach((msg: any) => {
      const uid = msg.user_id;
      const sid = msg.session_id || "__no_session__";
      if (!studentSessions.has(uid)) studentSessions.set(uid, new Map());
      const sessions = studentSessions.get(uid)!;
      if (!sessions.has(sid)) sessions.set(sid, []);
      sessions.get(sid)!.push(msg);
    });

    // 6. 构建编码表行
    const codingRows: any[] = [];

    studentSessions.forEach((sessions, uid) => {
      const student = studentMap.get(uid);
      if (!student) return;
      const srlGroup = srlMap.get(uid) || "";

      // 按时间排序会话
      const sortedSessions = Array.from(sessions.entries())
        .filter(([sid]) => sid !== "__no_session__")
        .sort((a, b) => new Date(a[1][0].created_at).getTime() - new Date(b[1][0].created_at).getTime());

      sortedSessions.forEach(([sid, msgs]) => {
        let turnId = 1;

        // 配对：user 消息 + 紧随其后的 assistant 消息 = 一个 turn
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].role !== "user") continue;

          const studentMsg = msgs[i];
          // 找到紧跟在后面的 assistant 消息
          let aiMsg: any = null;
          if (i + 1 < msgs.length && msgs[i + 1].role === "assistant") {
            aiMsg = msgs[i + 1];
          }

          const studentText = (studentMsg.content || "").trim();
          const aiText = aiMsg ? summarizeAI(aiMsg.content || "") : "";
          const aiCode = aiMsg ? detectAICode(aiMsg.content || "", studentText) : "";
          const inputMethod = studentMsg.input_method || "";

          // 查找该 turn 时间段内的交互事件
          const turnStartTime = new Date(studentMsg.created_at).getTime();
          const turnEndTime = aiMsg ? new Date(aiMsg.created_at).getTime() : turnStartTime + 60000;
          const eventKey = `${uid}_${sid}`;
          const sessionEvents = eventsBySession.get(eventKey) || [];
          const turnEvents = sessionEvents.filter((e: any) => {
            const t = new Date(e.created_at).getTime();
            return t >= turnStartTime && t <= turnEndTime;
          });
          const eventNote = turnEvents.map((e: any) => e.event_type).join(", ");

          codingRows.push({
            coder_id: "",
            student_id: student.student_id || "",
            student_name: student.name || "",
            grade: student.grade ? `${student.grade}年级` : "",
            class_num: student.class_num ? `${student.class_num}班` : "",
            srl_condition: srlGroup,
            session_id: sid,
            turn_id: `T${turnId}`,
            timestamp: new Date(studentMsg.created_at).toLocaleString("zh-CN"),
            input_method: inputMethod,
            student_text: studentText.slice(0, 500),
            ai_text: aiText,
            ai_code: aiCode,
            student_primary_code: "",
            student_aux_code_1: "",
            student_aux_code_2: "",
            ct_mapping: "",
            notes: eventNote ? `[事件: ${eventNote}]` : "",
          });

          turnId++;
        }
      });
    });

    // 按年级、班级、学号排序
    codingRows.sort((a, b) => {
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      if (a.class_num !== b.class_num) return a.class_num.localeCompare(b.class_num);
      if (a.student_id !== b.student_id) return a.student_id.localeCompare(b.student_id);
      return a.turn_id.localeCompare(b.turn_id, undefined, { numeric: true });
    });

    return NextResponse.json(codingRows);
  } catch (error: any) {
    console.error("[coding-export] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
