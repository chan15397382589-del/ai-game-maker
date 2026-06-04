import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// GET - 获取所有小组消息
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("group_id");

    let query = supabaseAdmin
      .from("group_messages")
      .select(`
        *,
        sender:users!group_messages_user_id_fkey(id, name, student_id, grade, class_num),
        group:groups!group_messages_group_id_fkey(id, name, grade, class_num)
      `);

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data, error } = await query.order("created_at", { ascending: true }).limit(1000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
