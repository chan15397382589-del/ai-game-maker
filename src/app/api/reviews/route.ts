import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — 获取分享列表（支持按年级/班级筛选），或获取统计信息
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
    const view = searchParams.get("view"); // "stats" 返回年级班级统计

    if (view === "stats") {
      // 返回每个年级和班级的分享数量
      const { data: all } = await db.from("shared_items").select("grade, class_num");
      const items = all || [];
      const stats: Record<string, number> = { all: items.length };
      items.forEach((item: any) => {
        if (item.grade) stats[`g${item.grade}`] = (stats[`g${item.grade}`] || 0) + 1;
        if (item.grade && item.class_num) stats[`g${item.grade}_c${item.class_num}`] = (stats[`g${item.grade}_c${item.class_num}`] || 0) + 1;
      });
      return NextResponse.json(stats);
    }

    // 获取当前用户信息
    const { data: userData } = await db
      .from("users")
      .select("grade, class_num, name")
      .eq("id", user.id)
      .single();

    // 从 query params 获取筛选条件，没有则默认用户的年级
    const filterGrade = searchParams.get("grade");
    const filterClass = searchParams.get("class_num");

    let query = db.from("shared_items").select("*").order("created_at", { ascending: false });

    if (filterGrade) {
      const grade = parseInt(filterGrade);
      query = query.eq("grade", grade);
      if (filterClass) {
        query = query.eq("class_num", parseInt(filterClass));
      }
    } else if (userData?.grade) {
      // 默认只看同年级
      query = query.eq("grade", userData.grade);
      if (userData.class_num) {
        query = query.or(`class_num.eq.${userData.class_num},class_num.is.null`);
      }
    }

    const { data: items, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取每个分享的点赞数、当前用户是否点赞、评论数、作者名
    const enriched = await Promise.all(
      (items || []).map(async (item: any) => {
        const [{ count: likeCount }, { data: myLike }, { count: commentCount }, { data: authorData }] =
          await Promise.all([
            db.from("likes").select("*", { count: "exact", head: true }).eq("shared_item_id", item.id),
            db.from("likes").select("id").eq("shared_item_id", item.id).eq("user_id", user.id).maybeSingle(),
            db.from("comments").select("*", { count: "exact", head: true }).eq("shared_item_id", item.id),
            db.from("users").select("name, grade, class_num").eq("id", item.user_id).single(),
          ]);

        return {
          ...item,
          like_count: likeCount || 0,
          liked_by_me: !!myLike,
          comment_count: commentCount || 0,
          author_name: authorData?.name || "未知",
          author_grade: authorData?.grade,
          author_class_num: authorData?.class_num,
          is_mine: item.user_id === user.id,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error("[reviews] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — 分享自己的作品到互评区
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

    const { conversation_id, game_title, html_code } = await req.json();

    if (!game_title || !html_code) {
      return NextResponse.json({ error: "缺少游戏标题或代码" }, { status: 400 });
    }

    const { data: userData } = await db
      .from("users")
      .select("grade, class_num")
      .eq("id", user.id)
      .single();

    const { data, error } = await db
      .from("shared_items")
      .insert({
        user_id: user.id,
        conversation_id: conversation_id || null,
        game_title,
        html_code,
        grade: userData?.grade,
        class_num: userData?.class_num,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[reviews] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
