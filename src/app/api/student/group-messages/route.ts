import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

// 获取当前用户
async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取小组消息
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("group_id");

    if (!groupId) {
      // 获取用户所在的小组
      const { data: memberships } = await supabaseAdmin
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (!memberships || memberships.length === 0) {
        return NextResponse.json([]);
      }

      const groupIds = memberships.map((m: any) => m.group_id);
      const { data, error } = await supabaseAdmin
        .from("group_messages")
        .select(`
          *,
          sender:users!group_messages_user_id_fkey(id, name, student_id)
        `)
        .in("group_id", groupIds)
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }

    // 获取指定小组的消息
    const { data, error } = await supabaseAdmin
      .from("group_messages")
      .select(`
        *,
        sender:users!group_messages_user_id_fkey(id, name, student_id)
      `)
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - 发送小组消息
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { group_id, content, message_type, voice_url, voice_transcript } = body;

    if (!group_id || !content) {
      return NextResponse.json({ error: "缺少group_id或content" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("group_messages")
      .insert({
        group_id,
        user_id: user.id,
        content,
        message_type: message_type || "text",
        voice_url: voice_url || null,
        voice_transcript: voice_transcript || null,
      })
      .select(`
        *,
        sender:users!group_messages_user_id_fkey(id, name, student_id)
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
