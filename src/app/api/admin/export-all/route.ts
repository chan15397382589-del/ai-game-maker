import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";
import { getDB } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");
    const type = searchParams.get("type") || "all";

    // 筛选学生
    let userQuery = supabaseAdmin.from("users").select("id, name, student_id, grade, class_num, srl_condition").eq("role", "student");
    if (grade) userQuery = userQuery.eq("grade", parseInt(grade));
    if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));
    const { data: students } = await userQuery.limit(500);
    if (!students || students.length === 0) {
      return NextResponse.json({ error: "没有学生数据" }, { status: 404 });
    }

    const studentIds = students.map((s: any) => s.id);
    const studentMap: Record<string, any> = {};
    students.forEach((s: any) => { studentMap[s.id] = s; });

    const trackingData = await getTrackingData(studentIds);

    // 并行获取所有数据
    const [
      tasksRes, surveyRes, messagesRes, gamesRes, reviewsRes, groupsRes,
    ] = await Promise.all([
      supabaseAdmin.from("student_tasks").select("*").in("user_id", studentIds).limit(2000),
      supabaseAdmin.from("student_tasks").select("user_id,design_reason").eq("task_id", "survey").in("user_id", studentIds),
      supabaseAdmin.from("messages").select("user_id,role,content,created_at").in("user_id", studentIds).order("created_at", { ascending: true }).limit(10000),
      supabaseAdmin.from("conversations").select("id,user_id,title,html_code,reflection").in("user_id", studentIds).not("html_code", "is", null).limit(500),
      supabaseAdmin.from("peer_reviews").select("*").in("reviewer_id", studentIds).limit(2000),
      supabaseAdmin.from("group_members").select("user_id,group_id,g:groups(id,name)").in("user_id", studentIds),
    ]);

    // 组装数据
    const date = new Date().toISOString().slice(0, 10);

    if (type === "excel") {
      // 返回 Excel 可用的 JSON 数据
      return NextResponse.json({
        students: students.map((s: any) => {
          const convs = (gamesRes.data || []).filter((c: any) => c.user_id === s.id);
          const msgs = (messagesRes.data || []).filter((m: any) => m.user_id === s.id);
          const reviews = (reviewsRes.data || []).filter((r: any) => r.reviewer_id === s.id);
          const groups = (groupsRes.data || []).filter((g: any) => g.user_id === s.id).map((g: any) => g.g?.name || g.group_id).join(",");
          const survey = (surveyRes.data || []).find((t: any) => t.user_id === s.id);
          let surveyAnswers: any = {};
          try { surveyAnswers = JSON.parse(survey?.design_reason || "{}"); } catch {}
          const tracking = (trackingData || []).find((t: any) => t.id === s.id);

          return {
            姓名: s.name, 学号: s.student_id, 年级: s.grade, 班级: s.class_num, 分组: s.srl_condition || "",
            "前测-Q1玩过游戏吗": surveyAnswers.q1 || "", "前测-Q2玩过哪些": surveyAnswers.q2 || "",
            "前测-Q3接触编程": surveyAnswers.q3 || "", "前测-Q4设计过游戏": surveyAnswers.q4 || "", "前测-Q5好游戏重要": surveyAnswers.q5 || "",
            对话数: tracking?.conversation_count || 0, 消息数: tracking?.message_count || 0,
            游戏数: tracking?.game_count || 0, 文字输入: tracking?.text_input || 0, 语音输入: tracking?.voice_input || 0,
            小组: groups, 互评数: reviews.length,
            对话记录: msgs.map((m: any) => `[${m.role}] ${(m.content||"").substring(0, 100)}`).join(" | "),
          };
        }),
      });
    }

    // 默认：动态打包 ZIP
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const root = zip.folder("班级数据导出")!;

    // 1. 学生名单 Excel
    const studentRows = students.map((s: any) => ({
      姓名: s.name, 学号: s.student_id, 年级: `${s.grade}年级`, 班级: `${s.class_num}班`, 分组: s.srl_condition || "未分组",
    }));
    addExcelSheet(studentRows.length > 0 ? studentRows : [{ 提示: "无数据" }], root, "学生名单");

    // 2. 前测数据
    const surveyRows = (surveyRes.data || []).map((t: any) => {
      let a: any = {};
      try { a = JSON.parse(t.design_reason || "{}"); } catch {}
      const s = studentMap[t.user_id] || {};
      return { 姓名: s.name, 学号: s.student_id, "Q1": a.q1||"", "Q2": a.q2||"", "Q3": a.q3||"", "Q4": a.q4||"", "Q5": a.q5||"" };
    });
    if (surveyRows.length > 0) addExcelSheet(surveyRows, root, "前测数据");

    // 3. 任务数据
    const taskRows = (tasksRes.data || []).map((t: any) => {
      const s = studentMap[t.user_id] || {};
      return { 姓名: s.name, 学号: s.student_id, 任务: t.task_id, 游戏名: t.game_name || "", 更新时间: new Date(t.updated_at).toLocaleString("zh-CN") };
    });
    if (taskRows.length > 0) addExcelSheet(taskRows, root, "任务数据");

    // 4. 活动数据
    if (trackingData.length > 0) addExcelSheet(trackingData, root, "活动数据");

    // 5. 对话记录
    const convWordDoc = (messagesRes.data || []).reduce((acc: any, m: any) => {
      const s = studentMap[m.user_id] || {};
      const name = `${s.name}(${s.student_id})`;
      if (!acc[name]) acc[name] = [];
      acc[name].push(`[${new Date(m.created_at).toLocaleString("zh-CN")}] ${m.role === "user" ? "学生" : "AI"}\n${(m.content || "").substring(0, 500)}`);
      return acc;
    }, {} as Record<string, string[]>);
    const wordFolder = root.folder("对话记录")!;
    for (const [name, lines] of Object.entries(convWordDoc)) {
      wordFolder.file(`${name}.txt`, (lines as string[]).join("\n---\n\n"));
    }

    // 6. 互评数据
    const reviewRows = (reviewsRes.data || []).map((r: any) => {
      const reviewer = studentMap[r.reviewer_id] || {};
      const reviewee = studentMap[r.reviewee_id] || {};
      return { 评价者: reviewer.name, 被评者: reviewee.name, 好玩之处: r.q1_enjoy, 建议: r.q2_suggestion, 问题: r.q3_bug || "" };
    });
    if (reviewRows.length > 0) addExcelSheet(reviewRows, root, "同伴互评");

    // 7. 反思数据
    const reflectionRows: any[] = [];
    (gamesRes.data || []).filter((c: any) => c.reflection).forEach((c: any) => {
      let ref: any = {};
      try { ref = JSON.parse(c.reflection); } catch {}
      const s = studentMap[c.user_id] || {};
      const toTxt = (v: any) => v ? (typeof v === "string" ? v : Object.values(v).filter(Boolean).join("，")) : "";
      reflectionRows.push({ 姓名: s.name, 学号: s.student_id, Q1: toTxt(ref.q1), Q2: toTxt(ref.q2), Q3: toTxt(ref.q3), Q4: toTxt(ref.q4), Q5: toTxt(ref.q5) });
    });
    if (reflectionRows.length > 0) addExcelSheet(reflectionRows, root, "学生反思");

    // 8. 游戏成品 HTML
    const gameFolder = root.folder("游戏成品")!;
    (gamesRes.data || []).forEach((c: any) => {
      const s = studentMap[c.user_id] || {};
      const fileName = `${s.name}_${s.student_id}_${(c.title || "游戏").replace(/[<>:"/\\|?*]/g, "_")}.html`;
      gameFolder.file(fileName, c.html_code || "");
    });

    // 生成 ZIP
    const zipBlob = await zip.generateAsync({ type: "uint8array" });

    return new NextResponse(zipBlob as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="班级数据导出_${grade || "全部"}年级${classNum || ""}_${date}.zip"`,
      },
    });
  } catch (err: any) {
    console.error("[export-all] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function getTrackingData(studentIds: string[]) {
  const [convRes, msgRes] = await Promise.all([
    supabaseAdmin.from("conversations").select("user_id,html_code").in("user_id", studentIds).limit(5000),
    supabaseAdmin.from("messages").select("user_id,input_method,has_code").in("user_id", studentIds).limit(50000),
  ]);

  const convCount: Record<string, number> = {};
  const gameCount: Record<string, number> = {};
  const msgCount: Record<string, number> = {};
  const textInput: Record<string, number> = {};
  const voiceInput: Record<string, number> = {};
  const codeGen: Record<string, number> = {};

  (convRes.data || []).forEach((c: any) => {
    convCount[c.user_id] = (convCount[c.user_id] || 0) + 1;
    if (c.html_code?.length > 100) gameCount[c.user_id] = (gameCount[c.user_id] || 0) + 1;
  });
  (msgRes.data || []).forEach((m: any) => {
    msgCount[m.user_id] = (msgCount[m.user_id] || 0) + 1;
    if (m.input_method === "text") textInput[m.user_id] = (textInput[m.user_id] || 0) + 1;
    if (m.input_method === "voice") voiceInput[m.user_id] = (voiceInput[m.user_id] || 0) + 1;
    if (m.has_code) codeGen[m.user_id] = (codeGen[m.user_id] || 0) + 1;
  });

  return studentIds.map((id) => ({
    id, conversation_count: convCount[id] || 0, game_count: gameCount[id] || 0,
    message_count: msgCount[id] || 0, text_input: textInput[id] || 0,
    voice_input: voiceInput[id] || 0, code_generations: codeGen[id] || 0,
  }));
}

let XLSX: typeof import("xlsx") | null = null;
async function getXLSX() { if (!XLSX) XLSX = await import("xlsx"); return XLSX; }

function addExcelSheet(rows: any[], zipFolder: any, name: string) {
  // 用 CSV 代替 Excel（无需 xlsx 库）
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r: any) => headers.map((h: string) => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  zipFolder.file(`${name}.csv`, "﻿" + csv);
}
