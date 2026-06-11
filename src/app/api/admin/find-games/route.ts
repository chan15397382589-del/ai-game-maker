import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

// 扫描所有表，找出学生生成的游戏数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const results: any = {
      projects: [],
      conversations: [],
      game_snapshots: [],
      messages_with_code: [],
      summary: {},
    };

    // 1. projects 表（学生主动上传的游戏）
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, user_id, game_title, html_code, is_published, created_at, users:user_id(name, student_id, grade, class_num)")
      .order("created_at", { ascending: false });

    results.projects = (projects || []).map((p: any) => ({
      source: "projects",
      id: p.id,
      user_id: p.user_id,
      user_name: p.users?.name,
      student_id: p.users?.student_id,
      grade: p.users?.grade,
      class_num: p.users?.class_num,
      game_title: p.game_title,
      html_code: p.html_code,
      code_length: p.html_code?.length || 0,
      created_at: p.created_at,
    }));

    // 2. conversations 表（对话中保存的游戏代码）
    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id, title, html_code, created_at, updated_at, users:user_id(name, student_id, grade, class_num)")
      .not("html_code", "is", null)
      .order("updated_at", { ascending: false });

    results.conversations = (conversations || []).map((c: any) => ({
      source: "conversations",
      id: c.id,
      user_id: c.user_id,
      user_name: c.users?.name,
      student_id: c.users?.student_id,
      grade: c.users?.grade,
      class_num: c.users?.class_num,
      game_title: c.title,
      html_code: c.html_code,
      code_length: c.html_code?.length || 0,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    // 3. game_snapshots 表（游戏版本快照）
    const { data: snapshots } = await supabaseAdmin
      .from("game_snapshots")
      .select("id, user_id, conversation_id, html_code, created_at, users:user_id(name, student_id, grade, class_num)")
      .order("created_at", { ascending: false })
      .limit(500);

    results.game_snapshots = (snapshots || []).map((s: any) => ({
      source: "game_snapshots",
      id: s.id,
      user_id: s.user_id,
      conversation_id: s.conversation_id,
      user_name: s.users?.name,
      student_id: s.users?.student_id,
      grade: s.users?.grade,
      class_num: s.users?.class_num,
      html_code: s.html_code,
      code_length: s.html_code?.length || 0,
      created_at: s.created_at,
    }));

    // 4. messages 表（AI回复中包含代码块的消息）
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("id, user_id, role, content, session_id, created_at, users:user_id(name, student_id, grade, class_num)")
      .eq("role", "assistant")
      .like("content", "%```html%")
      .order("created_at", { ascending: false })
      .limit(500);

    results.messages_with_code = (messages || []).map((m: any) => {
      // 提取代码块
      const codeMatch = m.content.match(/```html\s*\n([\s\S]*?)```/i);
      const code = codeMatch ? codeMatch[1].trim() : null;
      return {
        source: "messages",
        id: m.id,
        user_id: m.user_id,
        session_id: m.session_id,
        user_name: m.users?.name,
        student_id: m.users?.student_id,
        grade: m.users?.grade,
        class_num: m.users?.class_num,
        html_code: code,
        code_length: code?.length || 0,
        created_at: m.created_at,
      };
    }).filter((m: any) => m.html_code && m.html_code.length > 100);

    // 汇总统计
    const allUserIds = new Set<string>();
    const allGames = new Map<string, any>(); // 去重用

    for (const p of results.projects) {
      allUserIds.add(p.user_id);
      allGames.set(`${p.user_id}-project-${p.id}`, p);
    }
    for (const c of results.conversations) {
      allUserIds.add(c.user_id);
      allGames.set(`${c.user_id}-conv-${c.id}`, c);
    }
    for (const s of results.game_snapshots) {
      allUserIds.add(s.user_id);
    }
    for (const m of results.messages_with_code) {
      allUserIds.add(m.user_id);
    }

    results.summary = {
      total_projects: results.projects.length,
      total_conversations_with_code: results.conversations.length,
      total_snapshots: results.game_snapshots.length,
      total_messages_with_code: results.messages_with_code.length,
      total_students_with_games: allUserIds.size,
    };

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("Find games error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - 将 conversations/game_snapshots 中的游戏恢复到 projects 表
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const body = await req.json();
    const { action, source, ids } = body;

    if (action === "restore_from_conversations") {
      // 从 conversations 恢复到 projects
      let query = supabaseAdmin
        .from("conversations")
        .select("id, user_id, title, html_code")
        .not("html_code", "is", null);

      if (ids && ids.length > 0) {
        query = query.in("id", ids);
      }

      const { data: convs } = await query;
      if (!convs || convs.length === 0) {
        return NextResponse.json({ error: "没有找到可恢复的游戏" }, { status: 404 });
      }

      let restored = 0;
      let skipped = 0;

      for (const conv of convs) {
        // 检查是否已在 projects 中存在
        const { data: existing } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("user_id", conv.user_id)
          .eq("game_title", conv.title || "未命名游戏")
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { error } = await supabaseAdmin
          .from("projects")
          .insert({
            user_id: conv.user_id,
            game_title: conv.title || "未命名游戏",
            html_code: conv.html_code,
            is_published: false,
          });

        if (!error) restored++;
      }

      return NextResponse.json({ success: true, restored, skipped, total: convs.length });
    }

    if (action === "restore_from_snapshots") {
      // 从 game_snapshots 恢复到 projects（每个用户只恢复最新的一个）
      const { data: snapshots } = await supabaseAdmin
        .from("game_snapshots")
        .select("id, user_id, html_code, created_at, conversation_id, conversations:conversation_id(title)")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!snapshots || snapshots.length === 0) {
        return NextResponse.json({ error: "没有找到可恢复的快照" }, { status: 404 });
      }

      // 按用户分组，取每个用户最新的快照
      const userSnapshots = new Map<string, any>();
      for (const snap of snapshots) {
        if (!userSnapshots.has(snap.user_id)) {
          userSnapshots.set(snap.user_id, snap);
        }
      }

      let restored = 0;
      let skipped = 0;

      for (const [userId, snap] of userSnapshots) {
        // 检查该用户是否已有 projects
        const { data: existingProjects } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("user_id", userId)
          .limit(1);

        if (existingProjects && existingProjects.length > 0) {
          skipped++;
          continue;
        }

        const title = (snap as any).conversations?.title || "恢复的游戏";

        const { error } = await supabaseAdmin
          .from("projects")
          .insert({
            user_id: userId,
            game_title: title,
            html_code: snap.html_code,
            is_published: false,
          });

        if (!error) restored++;
      }

      return NextResponse.json({ success: true, restored, skipped, total: userSnapshots.size });
    }

    if (action === "restore_from_messages") {
      // 从 messages 中的代码块恢复到 projects
      const { data: messages } = await supabaseAdmin
        .from("messages")
        .select("id, user_id, content, created_at, session_id, users:user_id(name)")
        .eq("role", "assistant")
        .like("content", "%```html%")
        .order("created_at", { ascending: false })
        .limit(500);

      if (!messages) {
        return NextResponse.json({ error: "没有找到包含代码的消息" }, { status: 404 });
      }

      // 按用户分组，取每个用户最新的
      const userMessages = new Map<string, any>();
      for (const msg of messages) {
        const codeMatch = msg.content.match(/```html\s*\n([\s\S]*?)```/i);
        if (!codeMatch || codeMatch[1].trim().length < 100) continue;
        if (!userMessages.has(msg.user_id)) {
          userMessages.set(msg.user_id, { ...msg, extractedCode: codeMatch[1].trim() });
        }
      }

      let restored = 0;
      let skipped = 0;

      for (const [userId, msg] of userMessages) {
        // 检查该用户是否已有 projects
        const { data: existingProjects } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("user_id", userId)
          .limit(1);

        if (existingProjects && existingProjects.length > 0) {
          skipped++;
          continue;
        }

        const { error } = await supabaseAdmin
          .from("projects")
          .insert({
            user_id: userId,
            game_title: "从对话记录恢复的游戏",
            html_code: (msg as any).extractedCode,
            is_published: false,
          });

        if (!error) restored++;
      }

      return NextResponse.json({ success: true, restored, skipped, total: userMessages.size });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err: any) {
    console.error("Restore games error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
