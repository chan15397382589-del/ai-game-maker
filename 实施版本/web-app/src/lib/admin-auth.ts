import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================================
// 管理员身份验证
// - 验证 Auth token
// - 检查 users 表的 role 是否为 admin
// - 如果 users 表无记录 → 自动创建管理员记录（仅用于首次初始化）
// - ⚠️ 不再自动升级非 admin 用户为 admin（防止 session 混淆导致学生被升级）
// ============================================================
export async function getVerifiedAdmin(token: string): Promise<
  { userId: string; userName: string } | NextResponse
> {
  const db = getAdminClient();

  if (!token) {
    return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) {
    console.error("[admin-auth] 认证失败:", authError?.message);
    return NextResponse.json({ error: "认证已过期，请重新登录" }, { status: 401 });
  }

  // 查询 users 表
  const { data: existingUser, error: dbError } = await db
    .from("users")
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (!dbError && existingUser) {
    // 用户已存在，严格检查 role
    if (existingUser.role !== "admin") {
      console.warn("[admin-auth] 非管理员访问:", user.id, "角色:", existingUser.role);
      return NextResponse.json(
        { error: `无权限（当前角色：${existingUser.role}）` },
        { status: 403 }
      );
    }
    return { userId: user.id, userName: existingUser.name || "" };
  }

  // 用户不存在 → 创建管理员记录（首次初始化）
  console.log("[admin-auth] 自动初始化管理员:", user.id);

  const { error: upsertError } = await db.from("users").upsert(
    {
      id: user.id,
      name: user.user_metadata?.name || user.email?.split("@")[0] || "管理员",
      student_id: user.user_metadata?.student_id || user.email?.split("@")[0] || "admin",
      role: "admin",
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (upsertError) {
    console.error("[admin-auth] 初始化失败:", upsertError.message, "code:", upsertError.code);
    return NextResponse.json(
      { error: "管理员初始化失败：" + upsertError.message + " (code:" + upsertError.code + ")" },
      { status: 500 }
    );
  }

  console.log("[admin-auth] ✅ 初始化成功");
  return { userId: user.id, userName: user.user_metadata?.name || "管理员" };
}
