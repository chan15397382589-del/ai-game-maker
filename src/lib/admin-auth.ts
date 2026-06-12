import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

// 允许自动创建管理员的邮箱白名单
const ADMIN_WHITELIST = (process.env.ADMIN_WHITELIST || "").split(",").map(e => e.trim()).filter(Boolean);

// ============================================================
// 管理员身份验证
// - 验证 Auth token
// - 检查 users 表的 role 是否为 admin
// - 仅白名单邮箱可自动创建管理员记录
// ============================================================
export async function getVerifiedAdmin(token: string): Promise<
  { userId: string; userName: string } | NextResponse
> {
  if (!token) {
    return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    console.error("[admin-auth] 认证失败:", authError?.message);
    return NextResponse.json({ error: "认证已过期，请重新登录" }, { status: 401 });
  }

  // 查询 users 表
  const { data: existingUser, error: dbError } = await supabaseAdmin
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

  // 用户不存在 → 仅白名单邮箱可自动创建管理员
  const userEmail = user.email || "";
  if (!ADMIN_WHITELIST.includes(userEmail)) {
    console.warn("[admin-auth] 非白名单用户尝试创建管理员:", userEmail);
    return NextResponse.json(
      { error: "请联系管理员分配账号" },
      { status: 403 }
    );
  }

  console.log("[admin-auth] 白名单用户自动初始化管理员:", userEmail);

  const { error: upsertError } = await supabaseAdmin.from("users").upsert(
    {
      id: user.id,
      name: user.user_metadata?.name || userEmail.split("@")[0] || "管理员",
      student_id: user.user_metadata?.student_id || userEmail.split("@")[0] || "admin",
      role: "admin",
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (upsertError) {
    console.error("[admin-auth] 初始化失败:", upsertError.message);
    return NextResponse.json(
      { error: "管理员初始化失败：" + upsertError.message },
      { status: 500 }
    );
  }

  console.log("[admin-auth] ✅ 初始化成功");
  return { userId: user.id, userName: user.user_metadata?.name || "管理员" };
}
