import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");
    const token = req.headers.get("Authorization")?.replace("Bearer ", "")
      || searchParams.get("token") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    let userQuery = supabaseAdmin.from("users").select("id, name, student_id, grade, class_num, srl_condition").eq("role", "student");
    if (grade) userQuery = userQuery.eq("grade", parseInt(grade));
    if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));
    const { data: students } = await userQuery.limit(5000);
    if (!students || students.length === 0) {
      return NextResponse.json({ error: "没有学生数据" }, { status: 404 });
    }

    const studentIds = students.map((s: any) => s.id);
    const studentMap: Record<string, any> = {};
    students.forEach((s: any) => { studentMap[s.id] = s; });

    const trackingData = await getTrackingData(studentIds);

    const [
      tasksRes, surveyRes, messagesRes, gamesRes, reviewsRes, groupsRes,
    ] = await Promise.all([
      supabaseAdmin.from("student_tasks").select("*").in("user_id", studentIds).limit(5000),
      supabaseAdmin.from("student_tasks").select("user_id,design_reason").eq("task_id", "survey").in("user_id", studentIds),
      supabaseAdmin.from("messages").select("user_id,role,content,created_at").in("user_id", studentIds).order("created_at", { ascending: true }).limit(50000),
      supabaseAdmin.from("conversations").select("id,user_id,title,html_code,reflection").in("user_id", studentIds).not("html_code", "is", null).limit(2000),
      supabaseAdmin.from("peer_reviews").select("*").in("reviewer_id", studentIds).limit(5000),
      supabaseAdmin.from("group_members").select("user_id,group_id,g:groups(id,name)").in("user_id", studentIds),
    ]);

    const date = new Date().toISOString().slice(0, 10);

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // Helper: add CSV to zip with safe encoding
    const addCsv = (folder: any, name: string, rows: any[]) => {
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      const bom = "﻿";
      const csv = bom + headers.join(",") + "\n" +
        rows.map((r: any) => headers.map((h: string) => {
          const val = String(r[h] ?? "");
          return '"' + val.replace(/"/g, '""') + '"';
        }).join(",")).join("\n");
      folder.file(name + ".csv", csv);
    };

    // 1. 学生名单
    addCsv(zip, "学生名单", students.map((s: any) => ({
      姓名: s.name, 学号: s.student_id, 年级: s.grade + "年级", 班级: s.class_num + "班", 分组: s.srl_condition || "未分组",
    })));

    // 2. 前测数据
    const surveyRows = (surveyRes.data || []).map((t: any) => {
      let a: any = {};
      try { a = JSON.parse(t.design_reason || "{}"); } catch {}
      const s = studentMap[t.user_id] || {};
      return { 姓名: s.name, 学号: s.student_id, Q1: a.q1 || "", Q2: a.q2 || "", Q3: a.q3 || "", Q4: a.q4 || "", Q5: a.q5 || "" };
    });
    addCsv(zip, "前测数据", surveyRows);

    // 3. 任务数据
    const taskRows = (tasksRes.data || []).map((t: any) => {
      const s = studentMap[t.user_id] || {};
      return { 姓名: s.name, 学号: s.student_id, 任务: t.task_id, 游戏名: t.game_name || "", 更新时间: new Date(t.updated_at).toLocaleString("zh-CN") };
    });
    addCsv(zip, "任务数据", taskRows);

    // 4. 活动数据
    if (trackingData.length > 0) {
      const trackingRows = trackingData.map((t: any) => {
        const s = studentMap[t.id] || {};
        return {
          姓名: s.name, 学号: s.student_id,
          对话数: t.conversation_count, 游戏数: t.game_count, 消息数: t.message_count,
          文字输入: t.text_input, 语音输入: t.voice_input, AI生成代码: t.code_generations,
        };
      });
      addCsv(zip, "活动数据", trackingRows);
    }

    // 5. 对话记录
    const convWordDoc = (messagesRes.data || []).reduce((acc: any, m: any) => {
      const s = studentMap[m.user_id] || {};
      const key = `${s.name}_${s.student_id}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(`[${new Date(m.created_at).toLocaleString("zh-CN")}] ${m.role === "user" ? "学生" : "AI"}\n${(m.content || "").substring(0, 500)}`);
      return acc;
    }, {} as Record<string, string[]>);
    const chatFolder = zip.folder("对话记录")!;
    for (const [key, lines] of Object.entries(convWordDoc)) {
      chatFolder.file(`${key}.txt`, (lines as string[]).join("\n---\n\n"));
    }

    // 6. 互评数据
    const reviewRows = (reviewsRes.data || []).map((r: any) => {
      const reviewer = studentMap[r.reviewer_id] || {};
      const reviewee = studentMap[r.reviewee_id] || {};
      return { 评价者: reviewer.name, 被评者: reviewee.name, 好玩之处: r.q1_enjoy, 建议: r.q2_suggestion, 问题: r.q3_bug || "" };
    });
    addCsv(zip, "同伴互评", reviewRows);

    // 7. 反思数据
    const reflectionRows: any[] = [];
    (gamesRes.data || []).filter((c: any) => c.reflection).forEach((c: any) => {
      let ref: any = {};
      try { ref = JSON.parse(c.reflection); } catch {}
      const s = studentMap[c.user_id] || {};
      const toTxt = (v: any) => v ? (typeof v === "string" ? v : Object.values(v || {}).filter(Boolean).join("，")) : "";
      reflectionRows.push({ 姓名: s.name, 学号: s.student_id, Q1: toTxt(ref.q1), Q2: toTxt(ref.q2), Q3: toTxt(ref.q3), Q4: toTxt(ref.q4), Q5: toTxt(ref.q5) });
    });
    addCsv(zip, "学生反思", reflectionRows);

    // 8. 游戏成品 HTML（按班级分文件夹，文件名去除特殊字符）
    const gameFolder = zip.folder("游戏成品")!;
    (gamesRes.data || []).forEach((c: any) => {
      const s = studentMap[c.user_id] || {};
      // 安全文件名：只用字母数字下划线
      const safeTitle = (c.title || "game").replace(/[^\w一-鿿]/g, "_").substring(0, 30);
      const safeName = (s.name || "unknown").replace(/[^\w一-鿿]/g, "_");
      const classFolder = s.grade && s.class_num ? `G${s.grade}_C${s.class_num}` : "Unknown";
      const studentFolder = gameFolder.folder(classFolder)!;
      const fileName = `${safeName}_${safeTitle}.html`;
      studentFolder.file(fileName, c.html_code || "");
    });

    const zipData = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    return new NextResponse(zipData as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="export_${grade || "all"}_${date}.zip"`,
      },
    });
  } catch (err: any) {
    console.error("[export-all] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function getTrackingData(studentIds: string[]) {
  const [convRes, msgRes] = await Promise.all([
    supabaseAdmin.from("conversations").select("user_id,html_code").in("user_id", studentIds).limit(50000),
    supabaseAdmin.from("messages").select("user_id,input_method,has_code").in("user_id", studentIds).limit(100000),
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
