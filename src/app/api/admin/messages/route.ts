import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// 获取学生的聊天记录（教师审计用）
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // 分页参数
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(parseInt(searchParams.get("page_size") || "500"), 1000);
    const offset = (page - 1) * pageSize;

    let query = db
      .from("messages")
      .select("id, user_id, role, content, session_id, created_at", { count: "exact" })
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error: any) {
    console.error("[对话记录] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
