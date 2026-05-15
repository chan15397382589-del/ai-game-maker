import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 保存游戏作品
export async function POST(req: NextRequest) {
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

    const { user_id, game_title, html_code } = await req.json();

    if (user_id !== user.id) {
      return NextResponse.json({ error: "无权操作此用户的数据" }, { status: 403 });
    }

    const { data, error } = await db
      .from("projects")
      .insert({
        user_id,
        game_title,
        html_code,
        is_published: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[projects] 插入失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[projects] 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 获取游戏作品列表
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");

    let query = db
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (user_id) {
      if (user_id !== user.id) {
        return NextResponse.json({ error: "无权查看此用户的数据" }, { status: 403 });
      }
      query = query.eq("user_id", user_id);
    } else {
      const { data: userData } = await db
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!userData || userData.role !== "admin") {
        query = query.eq("user_id", user.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("[projects] 查询失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[projects] 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
