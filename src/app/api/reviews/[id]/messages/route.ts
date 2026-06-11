import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/supabase-admin";


// GET — 获取共享作品对应的 AI 聊天记录（只读，不暴露 user_id）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDB();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "无效的作品ID" }, { status: 400 });
    }

    // 获取共享作品的 conversation_id
    const { data: item, error: itemError } = await db
      .from("shared_items")
      .select("conversation_id")
      .eq("id", itemId)
      .single();

    if (itemError || !item || !item.conversation_id) {
      return NextResponse.json([]);
    }

    // 获取该对话的消息（用 service_role 绕过 RLS）
    const { data: messages, error: msgError } = await db
      .from("messages")
      .select("role, content, created_at")
      .eq("session_id", item.conversation_id)
      .order("created_at", { ascending: true });

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    return NextResponse.json(messages || []);
  } catch (error: any) {
    console.error("[reviews/messages] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
