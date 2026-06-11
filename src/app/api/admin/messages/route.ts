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

    let query = db
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50000);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[对话记录] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
