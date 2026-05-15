import { NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";

/**
 * 手动触发管理员初始化
 * 实际上所有 admin API 都会自动调用 getVerifiedAdmin()，
 * 此接口仅用于前端主动检测/提示初始化状态
 */
export async function POST(req: Request) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const result = await getVerifiedAdmin(token);

    if (result instanceof NextResponse) {
      return result;
    }

    return NextResponse.json({
      success: true,
      message: "✅ 管理员账号正常",
      userId: result.userId,
    });
  } catch (error: any) {
    console.error("[init] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
