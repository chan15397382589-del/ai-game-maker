import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// GET - 获取学生的任务数据（支持年级/班级筛选）
// ?action=counts → 返回每个 task_id 的记录数
// ?task_id=xxx → 返回该任务的具体数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const taskId = searchParams.get("task_id");
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    // 先获取符合年级/班级条件的学生ID
    let userQuery = supabaseAdmin
      .from("users")
      .select("id")
      .eq("role", "student");
    if (grade) userQuery = userQuery.eq("grade", parseInt(grade));
    if (classNum) userQuery = userQuery.eq("class_num", parseInt(classNum));

    const { data: filteredUsers } = await userQuery.limit(500);
    const filteredUserIds = (filteredUsers || []).map((u: any) => u.id);

    if (filteredUserIds.length === 0) {
      return action === "counts" ? NextResponse.json({}) : NextResponse.json([]);
    }

    // action=counts: 返回每个 task_id 的记录数
    if (action === "counts") {
      const { data: allTasks } = await supabaseAdmin
        .from("student_tasks")
        .select("task_id")
        .in("user_id", filteredUserIds)
        .limit(5000);

      const counts: Record<string, number> = {};
      (allTasks || []).forEach((t: any) => {
        counts[t.task_id] = (counts[t.task_id] || 0) + 1;
      });

      // 同时统计小组消息数、互评数、反思数
      const [{ count: groupMsgCount }, { count: reviewCount }, { count: reflectionCount }] = await Promise.all([
        supabaseAdmin.from("group_messages").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("peer_reviews").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }).not("reflection", "is", null),
      ]);

      return NextResponse.json({ taskCounts: counts, groupMessageCount: groupMsgCount || 0, peerReviewCount: reviewCount || 0, reflectionCount: reflectionCount || 0 });
    }

    // 获取任务数据（只查询符合条件的学生）
    let query = supabaseAdmin
      .from("student_tasks")
      .select("id, user_id, task_id, game_name, game_rules, design_image, design_reason, created_at, updated_at")
      .in("user_id", filteredUserIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data: tasks, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 批量获取用户信息
    const userIds = [...new Set((tasks || []).map((t: any) => t.user_id))];
    let userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .in("id", userIds);
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    // 组装结果，从 design_reason 中提取图片
    const tasksWithUsers = (tasks || []).map((t: any) => {
      let designImage = t.design_image || "";
      let imageHistory: any[] = [];
      let aiPrompt = "";

      try {
        const info = JSON.parse(t.design_reason || "{}");
        imageHistory = info.image_history || [];
        aiPrompt = info.ai_prompt || "";
        if (!designImage && imageHistory.length > 0) {
          designImage = imageHistory[imageHistory.length - 1].url || "";
        }
      } catch {}

      return {
        ...t,
        design_image: designImage,
        image_history: imageHistory,
        ai_prompt: aiPrompt,
        design_reason: undefined,
        user: userMap[t.user_id] || null,
      };
    });

    return NextResponse.json(tasksWithUsers);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
