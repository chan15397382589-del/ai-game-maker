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

    // 时间范围筛选
    const startTime = searchParams.get("start_time");
    const endTime = searchParams.get("end_time");

    let query = db
      .from("messages")
      .select("id, user_id, role, content, session_id, created_at")
      .order("created_at", { ascending: true });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    // 如果有时间范围，按时间筛选（用于加载单个会话的消息）
    if (startTime) {
      query = query.gte("created_at", startTime);
    }
    if (endTime) {
      query = query.lte("created_at", endTime);
    }

    // 限制返回数量（防止 OOM）
    if (userId && (startTime || endTime)) {
      query = query.limit(2000); // 单个会话的消息
    } else {
      query = query.limit(500); // 全局查询
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[对话记录] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
