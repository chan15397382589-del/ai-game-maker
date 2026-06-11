import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// ==================== GET: 所有作品（含未发布），支持按年级/班级筛选 ====================
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    let query = db
      .from("projects")
      .select("*, users!inner(name, student_id, grade, class_num)")
      .order("created_at", { ascending: false });

    if (grade) {
      query = query.eq("users.grade", parseInt(grade));
      if (classNum) {
        query = query.eq("users.class_num", parseInt(classNum));
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[作品列表] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== PATCH: 切换发布状态 ====================
export async function PATCH(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { id, is_published } = await req.json();

    const { error } = await db
      .from("projects")
      .update({ is_published })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[切换发布状态] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== DELETE: 删除作品 ====================
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { id } = await req.json();

    const { error } = await db.from("projects").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[删除作品] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
