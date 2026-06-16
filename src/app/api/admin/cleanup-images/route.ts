import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";

// 清理已过期的图片URL（火山引擎Ark API返回的临时URL）
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    // 1. 查找所有 design_image 以 http 开头的记录（临时URL，已过期）
    const { data: tasks, error: fetchError } = await supabaseAdmin
      .from("student_tasks")
      .select("id, design_image, design_reason")
      .like("design_image", "http%")
      .limit(200);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let cleanedCount = 0;
    let imageHistoryCleanedCount = 0;

    for (const task of tasks || []) {
      let needsUpdate = false;
      const updateData: any = {};

      // 清除过期的 design_image URL
      if (task.design_image && task.design_image.startsWith("http")) {
        updateData.design_image = null;
        needsUpdate = true;
      }

      // 清除 design_reason 中 image_history 的过期URL
      if (task.design_reason) {
        try {
          const info = JSON.parse(task.design_reason);
          if (info.image_history && Array.isArray(info.image_history)) {
            const originalLen = info.image_history.length;
            // 保留没有url的条目，或url以data:开头的条目（base64格式）
            info.image_history = info.image_history.filter(
              (item: any) => !item.url || item.url.startsWith("data:")
            );
            if (info.image_history.length !== originalLen) {
              imageHistoryCleanedCount += originalLen - info.image_history.length;
              // 如果image_history为空，清除ai_prompt引用的图片
              if (info.image_history.length === 0) {
                info.ai_prompt = "";
              }
              updateData.design_reason = JSON.stringify(info);
              needsUpdate = true;
            }
          }
        } catch (err) { console.error(err); }
      }

      if (needsUpdate) {
        await supabaseAdmin
          .from("student_tasks")
          .update(updateData)
          .eq("id", task.id);
        cleanedCount++;
      }
    }

    // 2. 也检查 design_reason 中有 image_history 但 design_image 不是 http 的情况
    const { data: tasksWithHistory } = await supabaseAdmin
      .from("student_tasks")
      .select("id, design_reason")
      .not("design_reason", "is", null);

    for (const task of tasksWithHistory || []) {
      try {
        const info = JSON.parse(task.design_reason);
        if (info.image_history && Array.isArray(info.image_history)) {
          const hasHttpUrls = info.image_history.some(
            (item: any) => item.url && item.url.startsWith("http")
          );
          if (hasHttpUrls) {
            const originalLen = info.image_history.length;
            info.image_history = info.image_history.filter(
              (item: any) => !item.url || item.url.startsWith("data:")
            );
            imageHistoryCleanedCount += originalLen - info.image_history.length;
            if (info.image_history.length === 0) {
              info.ai_prompt = "";
            }
            await supabaseAdmin
              .from("student_tasks")
              .update({ design_reason: JSON.stringify(info) })
              .eq("id", task.id);
          }
        }
      } catch (err) { console.error(err); }
    }

    return NextResponse.json({
      success: true,
      message: `清理完成：清除了 ${cleanedCount} 条过期设计图，${imageHistoryCleanedCount} 条过期历史图片`,
      cleanedTasks: cleanedCount,
      cleanedHistoryImages: imageHistoryCleanedCount,
    });
  } catch (err: any) {
    console.error("Cleanup images error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
