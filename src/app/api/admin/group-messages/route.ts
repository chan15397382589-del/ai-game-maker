import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// GET - 获取小组消息（支持 grade/class_num 筛选）
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("group_id");
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    // 获取消息
    let query = supabaseAdmin
      .from("group_messages")
      .select("id, group_id, user_id, content, message_type, voice_transcript, created_at")
      .order("created_at", { ascending: true })
      .limit(1000);

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data: messages, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!messages || messages.length === 0) {
      return NextResponse.json([]);
    }

    // 批量获取用户信息
    const userIds = [...new Set(messages.map((m: any) => m.user_id).filter(Boolean))];
    let userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .in("id", userIds);
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    // 批量获取小组信息
    const groupIds = [...new Set(messages.map((m: any) => m.group_id).filter(Boolean))];
    let groupMap: Record<string, any> = {};
    if (groupIds.length > 0) {
      let groupQuery = supabaseAdmin
        .from("groups")
        .select("id, name, grade, class_num")
        .in("id", groupIds);
      if (grade) groupQuery = groupQuery.eq("grade", parseInt(grade));
      if (classNum) groupQuery = groupQuery.eq("class_num", parseInt(classNum));
      const { data: groups } = await groupQuery;
      (groups || []).forEach((g: any) => { groupMap[g.id] = g; });
    }

    // 如果有 grade/class 筛选，只保留匹配小组的消息
    const filteredGroupIds = grade || classNum ? new Set(Object.keys(groupMap)) : null;

    // 组装结果
    const result = messages
      .filter((m: any) => !filteredGroupIds || filteredGroupIds.has(m.group_id))
      .map((m: any) => ({
        ...m,
        sender: userMap[m.user_id] || null,
        group: groupMap[m.group_id] || null,
      }));

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
