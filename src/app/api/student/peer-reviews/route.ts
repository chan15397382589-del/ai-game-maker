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
      // 获取我的班级信息
      const { data: myInfo } = await db
        .from("users")
        .select("grade, class_num")
        .eq("id", user.id)
        .single();

      // 获取同班同学ID
      let classmateQuery = db
        .from("users")
        .select("id")
        .eq("grade", myInfo?.grade || 0)
        .eq("role", "student");
      if (myInfo?.class_num) {
        classmateQuery = classmateQuery.eq("class_num", myInfo.class_num);
      }
      const { data: classmates } = await classmateQuery;
      const classmateIds = new Set((classmates || []).map((c: any) => c.id));

      // 获取别人对我游戏的评价
      const { data, error } = await db
        .from("peer_reviews")
        .select("*")
        .eq("reviewee_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // 只保留同班同学的评价
      const filtered = (data || []).filter((r: any) => classmateIds.has(r.reviewer_id));

      // 获取评价者信息
      const reviewerIds = [...new Set(filtered.map((r: any) => r.reviewer_id))];
      const { data: reviewers } = reviewerIds.length > 0
        ? await db.from("users").select("id, name, student_id").in("id", reviewerIds)
        : { data: [] };
      const reviewerMap: Record<string, any> = {};
      (reviewers || []).forEach((r: any) => { reviewerMap[r.id] = r; });

      const result = filtered.map((r: any) => ({
        ...r,
        reviewer: reviewerMap[r.reviewer_id] || { name: "匿名" },
      }));

      return NextResponse.json(result);
    }

    // mode === "tasks": 获取我需要评价的游戏
    const { data: myInfo } = await db
      .from("users")
      .select("grade, class_num")
      .eq("id", user.id)
      .single();

    if (!myInfo?.grade) {
      return NextResponse.json({ error: "请先完善年级和班级信息" }, { status: 400 });
    }

    // 获取我已经评价过的同学ID
    const { data: myReviews } = await db
      .from("peer_reviews")
      .select("reviewee_id")
      .eq("reviewer_id", user.id);
    const reviewedIds = (myReviews || []).map((r: any) => r.reviewee_id);

    // 获取同班有游戏的同学（从 conversations 表，排除自己）
    const classQuery = db
      .from("users")
      .select("id, name, student_id")
      .eq("grade", myInfo.grade)
      .eq("role", "student");

    // 如果有班级信息，只看同班同学
    if (myInfo.class_num) {
      classQuery.eq("class_num", myInfo.class_num);
    }

    const { data: classmates } = await classQuery;

    const classmateIds = (classmates || [])
      .map((c: any) => c.id)
      .filter((id: string) => id !== user.id);

    if (classmateIds.length === 0) {
      return NextResponse.json({ tasks: [], totalReviewed: reviewedIds.length, totalAvailable: 0 });
    }

    // 获取这些同学的有游戏代码的最新对话（需要 html_code 用于预览）
    const { data: convs } = await db
      .from("conversations")
      .select("id, user_id, title, html_code, updated_at")
      .in("user_id", classmateIds)
      .not("html_code", "is", null)
      .order("updated_at", { ascending: false })
      .limit(500);

    // 每个同学只保留最新的一条有游戏的对话
    const seen = new Set<string>();
    const gameMap: Record<string, any> = {};
    for (const c of convs || []) {
      if (seen.has(c.user_id)) continue;
      seen.add(c.user_id);
      gameMap[c.user_id] = c;
    }

    // 获取每个同学收到的评价数量，优先选评价少的
    const { data: allReviews } = await db
      .from("peer_reviews")
      .select("reviewee_id")
      .in("reviewee_id", classmateIds);

    const reviewCountMap: Record<string, number> = {};
    (allReviews || []).forEach((r: any) => {
      reviewCountMap[r.reviewee_id] = (reviewCountMap[r.reviewee_id] || 0) + 1;
    });

    // 构建评价者信息
    const classmateMap: Record<string, any> = {};
    (classmates || []).forEach((c: any) => { classmateMap[c.id] = c; });

    // 过滤已评价的
    const available = classmateIds
      .filter((id: string) => !reviewedIds.includes(id) && gameMap[id])
      .map((id: string) => ({
        id: gameMap[id].id,
        user_id: id,
        game_title: gameMap[id].title || "未命名游戏",
        html_code: gameMap[id].html_code,
        author: classmateMap[id],
        review_count: reviewCountMap[id] || 0,
      }));

    // 稳定的分配：基于评价者ID的伪随机排序（同一评价者每次看到相同的顺序）
    // 使用简单的 hash 函数生成确定性"随机"种子
    const seed = [...user.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const seededRandom = (() => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
      };
    })();

    // 按评价数分组，组内用确定性随机排序
    const groups: Record<number, any[]> = {};
    for (const item of available) {
      const count = item.review_count;
      if (!groups[count]) groups[count] = [];
      groups[count].push(item);
    }
    for (const key of Object.keys(groups)) {
      groups[Number(key)].sort(() => seededRandom() - 0.5);
    }
    // 按评价数从少到多拼接
    const sorted = Object.keys(groups).sort().flatMap((key) => groups[Number(key)]);
    const selected = sorted.slice(0, 3);

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

    if (!reviewee_id) {
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
        shared_item_id: shared_item_id || 0,
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
