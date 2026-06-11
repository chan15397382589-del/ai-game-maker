import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// ==================== POST: 批量重置学生密码 ====================
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const body = await req.json();
    const { student_ids, password } = body;

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json({ error: "无学生 ID" }, { status: 400 });
    }

    const newPassword = password || "123456";
    const db = getDB();
    let success = 0;
    let failed = 0;

    for (const userId of student_ids) {
      try {
        const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword });
        if (error) {
          console.warn(`[重置密码] 失败 ${userId}:`, error.message);
          failed++;
        } else {
          success++;
        }
      } catch (err) {
        failed++;
      }
    }

    return NextResponse.json({ success, failed, total: student_ids.length });
  } catch (error: any) {
    console.error("[重置密码] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
