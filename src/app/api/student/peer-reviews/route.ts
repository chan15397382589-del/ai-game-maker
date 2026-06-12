import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/deepseek";

async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET - 获取评价任务或我的评价
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const db = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode"); // "tasks" | "my_reviews"

    if (mode === "my_reviews") {
      // 获取别人对我游戏的评价
      const { data, error } = await db
        .from("peer_reviews")
        .select("*, reviewer:users!peer_reviews_reviewer_id_fkey(name, student_id), item:shared_items(game_title, html_code)")
        .eq("reviewee_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }

    // mode === "tasks": 获取我需要评价的游戏
    // 1. 获取我的用户信息
    const { data: myInfo } = await db
      .from("users")
      .select("grade, class_num")
      .eq("id", user.id)
      .single();

    if (!myInfo?.grade || !myInfo?.class_num) {
      return NextResponse.json({ error: "请先完善年级和班级信息" }, { status: 400 });
    }

    // 2. 获取我已经评价过的同学ID
    const { data: myReviews } = await db
      .from("peer_reviews")
      .select("reviewee_id")
      .eq("reviewer_id", user.id);

    const reviewedIds = (myReviews || []).map((r: any) => r.reviewee_id);

    // 3. 获取同班同学分享的游戏（排除自己）
    const { data: items, error } = await db
      .from("shared_items")
      .select("*, author:users!shared_items_user_id_fkey(name, student_id)")
      .eq("grade", myInfo.grade)
      .eq("class_num", myInfo.class_num)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 4. 获取每个同学收到的评价数量，优先选评价少的
    const revieweeIds = [...new Set((items || []).map((i: any) => i.user_id))];
    const { data: allReviews } = await db
      .from("peer_reviews")
      .select("reviewee_id")
      .in("reviewee_id", revieweeIds);

    const reviewCountMap: Record<string, number> = {};
    (allReviews || []).forEach((r: any) => {
      reviewCountMap[r.reviewee_id] = (reviewCountMap[r.reviewee_id] || 0) + 1;
    });

    // 5. 过滤已评价的，按收到评价数排序（优先分配给评价少的同学）
    const available = (items || []).filter((i: any) => !reviewedIds.includes(i.user_id));
    available.sort((a: any, b: any) => {
      const countA = reviewCountMap[a.user_id] || 0;
      const countB = reviewCountMap[b.user_id] || 0;
      return countA - countB;
    });

    // 6. 去重（同一同学只保留最新的一条），取前3个
    const seen = new Set<string>();
    const selected: any[] = [];
    for (const item of available) {
      if (!seen.has(item.user_id) && selected.length < 3) {
        seen.add(item.user_id);
        selected.push(item);
      }
    }

    return NextResponse.json({
      tasks: selected,
      totalReviewed: reviewedIds.length,
      totalAvailable: available.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - 提交评价
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { reviewee_id, shared_item_id, q1_enjoy, q2_suggestion, q3_bug } = await req.json();

    if (!reviewee_id || !shared_item_id) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (reviewee_id === user.id) {
      return NextResponse.json({ error: "不能评价自己的游戏" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // 检查是否已评价
    const { data: existing } = await db
      .from("peer_reviews")
      .select("id")
      .eq("reviewer_id", user.id)
      .eq("reviewee_id", reviewee_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "你已经评价过这个游戏了" }, { status: 400 });
    }

    const { data, error } = await db
      .from("peer_reviews")
      .insert({
        reviewer_id: user.id,
        reviewee_id,
        shared_item_id,
        q1_enjoy: q1_enjoy || "",
        q2_suggestion: q2_suggestion || "",
        q3_bug: q3_bug || "",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
