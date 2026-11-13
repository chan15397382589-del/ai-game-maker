import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";
import { catAdminAction, catAdminOverview, catAdminProjectPreview } from "@/lib/cat-admin";

export const dynamic = "force-dynamic";

function isExpectedError(error: unknown): boolean {
  return error instanceof Error && !/relation .* does not exist|schema cache/i.test(error.message);
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const admin = await getVerifiedAdmin(token);
  if (admin instanceof NextResponse) return admin;
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batch_id") || undefined;
    const sourceId = searchParams.get("source_id") || searchParams.get("project_id");
    const result = sourceId
      ? await catAdminProjectPreview(supabaseAdmin, batchId, searchParams.get("source_type") || "projects", sourceId)
      : await catAdminOverview(supabaseAdmin, batchId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CAT admin GET]", error);
    return NextResponse.json({ error: isExpectedError(error) ? (error as Error).message : "CAT数据库表未就绪，请先完成迁移" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const admin = await getVerifiedAdmin(token);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请求格式错误");
    const result = await catAdminAction(supabaseAdmin, admin.userId, body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[CAT admin POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 400 });
  }
}
