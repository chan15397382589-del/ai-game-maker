import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { catReviewerAssignment, catReviewerQueue, saveCatScore, verifiedCatReviewer } from "@/lib/cat-reviewer";

export const dynamic = "force-dynamic";

async function reviewerFor(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return verifiedCatReviewer(supabaseAdmin, token);
}

export async function GET(request: NextRequest) {
  try {
    const reviewer = await reviewerFor(request);
    if (!reviewer) return NextResponse.json({ error: "评审账号未授权" }, { status: 403 });
    const assignmentId = new URL(request.url).searchParams.get("assignment_id");
    const data = assignmentId
      ? await catReviewerAssignment(supabaseAdmin, reviewer.id, assignmentId)
      : await catReviewerQueue(supabaseAdmin, reviewer.id);
    if (assignmentId && !data) return NextResponse.json({ error: "评分任务不存在或批次未开放" }, { status: 404 });
    return NextResponse.json({ reviewer_code: reviewer.reviewer_code, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CAT review GET]", error);
    return NextResponse.json({ error: "无法读取评分任务，请联系管理员检查数据库" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const reviewer = await reviewerFor(request);
    if (!reviewer) return NextResponse.json({ error: "评审账号未授权" }, { status: 403 });
    const body = await request.json();
    const data = await saveCatScore(supabaseAdmin, reviewer.id, body.assignment_id, body.score, body.submit === true);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[CAT review POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}
