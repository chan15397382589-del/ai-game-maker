import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

// 导出对话记录（含学生信息），用于 Excel 导出
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    // 获取学生信息
    const { data: students } = await supabaseAdmin
      .from("users")
      .select("id, name, student_id, grade, class_num")
      .eq("role", "student");

    const studentMap = new Map<string, any>();
    (students || []).forEach((s) => studentMap.set(s.id, s));

    // 获取消息
    let query = supabaseAdmin
      .from("messages")
      .select("user_id, role, content, session_id, created_at")
      .order("created_at", { ascending: true });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    // 将 HTML 代码从 content 中移除，只保留纯文本
    const stripHtmlCode = (content: string): string => {
      return content
        .replace(/```html[\s\S]*?```/g, "[游戏代码]")
        .replace(/```[\s\S]*?```/g, "[代码]")
        .trim();
    };

    const result = (messages || []).map((msg) => {
      const student = studentMap.get(msg.user_id);
      return {
        student_name: student?.name || "未知",
        student_id: student?.student_id || "",
        grade: student?.grade ?? "",
        class_num: student?.class_num ?? "",
        session_id: msg.session_id || "",
        role: msg.role === "user" ? "学生" : "AI老师",
        content: stripHtmlCode(msg.content || ""),
        created_at: msg.created_at,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[导出对话] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
