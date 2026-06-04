import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 保存消息（使用 service role 绕过 RLS）
export async function POST(req: NextRequest) {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";

    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    const { userId, role, content } = await req.json();

    if (!userId || !role || !content) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    if (userId !== user.id) {
      return NextResponse.json({ error: "无权保存此用户的消息" }, { status: 403 });
    }

    const { error } = await db.from("messages").insert({
      user_id: userId,
      role,
      content,
    });

    if (error) {
      console.error("[save-message] 插入失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[save-message] 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
