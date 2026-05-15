import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ==================== GET: 学生列表 ====================
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { data, error } = await db
      .from("users")
      .select("*")
      .eq("role", "student")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[学生列表] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== POST: 添加学生 ====================
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const body = await req.json();
    const { name, student_id, email, password } = body;

    if (!name || !student_id || !email || !password) {
      return NextResponse.json({ error: "请填写完整信息" }, { status: 400 });
    }

    // 1. Auth 注册
    const { data: signUpData, error: signUpError } = await db.auth.signUp({
      email,
      password,
      options: {
        data: { name, student_id },
        emailRedirectTo: undefined,
      },
    });

    if (signUpError) throw signUpError;
    if (!signUpData.user) throw new Error("注册失败：Auth 用户未创建");

    // 2. 写入 users 表（无 email 列）
    const { error: insertError } = await db.from("users").insert({
      id: signUpData.user.id,
      name,
      student_id,
      role: "student",
    });

    if (insertError) {
      const { error: updateError } = await db
        .from("users")
        .update({ name, student_id, role: "student" })
        .eq("id", signUpData.user.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: "学生账号创建成功",
      user: { id: signUpData.user.id, name, student_id },
    });
  } catch (error: any) {
    console.error("[添加学生] 失败:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== DELETE: 删除学生 ====================
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    await db.auth.admin.deleteUser(userId);
    await db.from("users").delete().eq("id", userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[删除学生] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
