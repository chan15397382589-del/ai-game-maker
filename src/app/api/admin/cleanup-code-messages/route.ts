import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// POST - 删除包含代码的消息
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const adminCheck = await getVerifiedAdmin(token);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    // 查询包含代码块的助手消息
    const { data: messages, error: fetchError } = await supabaseAdmin
      .from("messages")
      .select("id, content")
      .eq("role", "assistant")
      .like("content", "%```%");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // 过滤出包含代码的消息
    const codeMessages = (messages || []).filter((m: any) => {
      const content = m.content || "";
      return content.includes("```html") || content.includes("```css") || content.includes("```js") || content.includes("<!DOCTYPE") || content.includes("<html");
    });

    if (codeMessages.length === 0) {
      return NextResponse.json({ message: "没有找到包含代码的消息", deleted: 0 });
    }

    // 删除这些消息
    const ids = codeMessages.map((m: any) => m.id);
    const { error: deleteError } = await supabaseAdmin
      .from("messages")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `已删除 ${ids.length} 条包含代码的消息`,
      deleted: ids.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
