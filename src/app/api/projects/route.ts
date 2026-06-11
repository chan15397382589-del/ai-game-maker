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

    const { game_title, html_code, reflection } = await req.json();

    const insertData: Record<string, any> = { user_id: user.id, game_title, html_code, is_published: false };
    if (reflection) insertData.reflection = reflection;

    const { data, error } = await db
      .from("projects")
      .insert(insertData)
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

// 更新游戏作品（用于保存反思数据等）
export async function PATCH(req: NextRequest) {
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

    const { id, reflection, game_title } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "缺少作品 ID" }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (reflection !== undefined) updates.reflection = reflection;
    if (game_title !== undefined) updates.game_title = game_title;

    const { data, error } = await db
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[projects] PATCH 失败:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[projects] PATCH 异常:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
