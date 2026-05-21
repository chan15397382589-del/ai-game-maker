import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

const MAX_CONVERSATIONS = 2; // 每位学生最多2个对话文档

// 获取当前用户（从 token）
async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取对话文档列表
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // 获取所有对话文档（不包含 html_code，减少响应体积）
    const { data: conversations, error } = await supabaseAdmin
      .from("conversations")
      .select("id, title, html_code, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取每个对话的消息数量
    const result = [];
    for (const conv of (conversations || [])) {
      const { count } = await supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("session_id", conv.id);

      result.push({
        id: conv.id,
        title: conv.title,
        has_game: !!conv.html_code,
        html_code: conv.html_code, // 前端 loadConversation 需要用到
        message_count: count || 0,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[sessions] GET 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - 创建新对话文档
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // 检查是否已达到最大数量
    const { count } = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count || 0) >= MAX_CONVERSATIONS) {
      return NextResponse.json(
        { error: `每位学生最多只能有 ${MAX_CONVERSATIONS} 个对话文档，请先删除其他文档` },
        { status: 400 }
      );
    }

    // 创建新对话
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .insert({ user_id: user.id, title: "新对话" })
      .select()
      .single();

    if (error) {
      console.error("[sessions] POST 插入失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[sessions] POST 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - 删除对话文档及其所有消息
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "缺少对话 ID" }, { status: 400 });
    }

    // 验证该对话属于当前用户
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!conv) {
      return NextResponse.json({ error: "对话不存在或无权操作" }, { status: 404 });
    }

    // 删除该对话的所有消息
    const { error: msgError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("session_id", id);

    if (msgError) {
      console.error("[sessions] 删除消息失败:", msgError);
    }

    // 删除对话文档
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[sessions] 删除对话失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[sessions] DELETE 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - 更新对话文档（标题或游戏代码）
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id, title, html_code, reflection } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "缺少对话 ID" }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (html_code !== undefined) updates.html_code = html_code;
    if (reflection !== undefined) updates.reflection = reflection;

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[sessions] PATCH 更新失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 保存游戏快照（记录每次生成/修改的游戏代码）
    if (html_code !== undefined && html_code) {
      try {
        await supabaseAdmin
          .from("game_snapshots")
          .insert({
            user_id: user.id,
            conversation_id: id,
            html_code,
          });
      } catch (snapErr: any) {
        console.error("[sessions] 快照保存失败:", snapErr.message);
        // 不影响主流程，游戏代码已保存到 conversations
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[sessions] PATCH 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
