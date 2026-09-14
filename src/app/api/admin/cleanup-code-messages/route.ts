import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// 历史接口曾删除包含HTML代码的AI消息，现永久禁用并保留410响应，
// 防止旧管理页面、书签或脚本误调用后再次破坏研究数据。
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const adminCheck = await getVerifiedAdmin(token);
  if (adminCheck instanceof NextResponse) return adminCheck;

  return NextResponse.json({
    error: "该接口已永久禁用：AI回复及其中的HTML代码属于研究原始数据，禁止删除。",
    deleted: 0,
  }, { status: 410 });
}
