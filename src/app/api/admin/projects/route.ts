import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ==================== GET: 所有作品（含未发布） ====================
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { data, error } = await db
      .from("projects")
      .select("*, users(name, student_id)")
      .order("created_at", { ascending: false });

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
