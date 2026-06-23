import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";

// 获取当前用户
async function getUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST - 创建小组（自动将创建者加入）
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { group_id, group_name } = body;

    if (!group_id) {
      return NextResponse.json({ error: "缺少group_id" }, { status: 400 });
    }

    // 检查小组是否已存在
    const { data: existing } = await supabaseAdmin
      .from("groups")
      .select("id")
      .eq("id", group_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "小组口令已被使用，请重新创建" }, { status: 409 });
    }

    // 创建小组
    const { error: groupError } = await supabaseAdmin
      .from("groups")
      .insert({
        id: group_id,
        name: group_name || `小组${group_id}`,
      });

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 });
    }

    // 将创建者加入小组
    const { error: memberError } = await supabaseAdmin
      .from("group_members")
      .insert({
        group_id,
        user_id: user.id,
      });

    if (memberError) {
      // 如果添加成员失败，删除刚创建的小组
      console.error("Failed to add creator as member, rolling back:", memberError);
      await supabaseAdmin.from("groups").delete().eq("id", group_id);
      return NextResponse.json({ error: "创建小组失败，请重试" }, { status: 500 });
    }

    return NextResponse.json({ success: true, group_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT - 加入小组
export async function PUT(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await req.json();
    const { group_id } = body;

    if (!group_id) {
      return NextResponse.json({ error: "缺少group_id" }, { status: 400 });
    }

    // 检查小组是否存在
    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id, name")
      .eq("id", group_id)
      .maybeSingle();

    if (groupError || !group) {
      return NextResponse.json({ error: "小组不存在，请检查口令" }, { status: 404 });
    }

    // 检查是否已是成员
    const { data: existingMember } = await supabaseAdmin
      .from("group_members")
      .select("user_id")
      .eq("group_id", group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMember) {
      // 已是成员，直接返回成功
      return NextResponse.json({ success: true, group_id, already_joined: true });
    }

    // 加入小组
    const { error: memberError } = await supabaseAdmin
      .from("group_members")
      .insert({
        group_id,
        user_id: user.id,
      });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, group_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET - 获取小组成员列表
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("group_id");

    if (!groupId) {
      return NextResponse.json({ error: "缺少group_id" }, { status: 400 });
    }

    // 获取小组成员（关联users表获取姓名等信息）
    const { data: members, error } = await supabaseAdmin
      .from("group_members")
      .select(`
        user_id,
        joined_at,
        user:users!group_members_user_id_fkey(id, name, student_id, grade, class_num)
      `)
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(members || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
