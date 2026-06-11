import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

// 获取对话详细信息（含 reflection）
// ?id=xxx      → 单个对话
// ?user_id=xxx → 某学生的所有对话
// ?all=1       → 全部有 reflection 的对话（含学生信息）
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("user_id");
    const all = searchParams.get("all");

    if (id) {
      const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id, title, html_code, reflection, user_id, created_at, updated_at")
        .eq("id", id)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // all 模式：返回全部有 reflection 的对话 + 学生信息
    if (all === "1") {
      const { data: students } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .eq("role", "student");
      const studentMap = new Map<string, any>();
      (students || []).forEach((s: any) => studentMap.set(s.id, s));

      const { data: convs, error } = await supabaseAdmin
        .from("conversations")
        .select("id, title, reflection, user_id, updated_at")
        .not("reflection", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const result = (convs || []).map((c: any) => {
        const s = studentMap.get(c.user_id);
        return {
          ...c,
          student_name: s?.name || "未知",
          student_id: s?.student_id || "",
          grade: s?.grade ?? "",
          class_num: s?.class_num ?? "",
        };
      });

      return NextResponse.json(result);
    }

    // user_id 模式
    if (userId) {
      const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id, title, html_code, reflection, user_id, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const withReflection = (data || []).filter((c: any) => c.reflection);
      const withoutReflection = (data || []).filter((c: any) => !c.reflection);
      return NextResponse.json([...withReflection, ...withoutReflection]);
    }

    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
