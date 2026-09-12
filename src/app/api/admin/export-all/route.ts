import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { buildResearchExport, researchExportFilename, type ResearchExportData } from "@/lib/admin-export";
import { supabaseAdmin } from "@/lib/deepseek";
import { runWithTransientRetry } from "@/lib/supabase-query-retry";

export const runtime = "nodejs";
export const maxDuration = 300;

const PAGE_SIZE = 1000;
const STUDENT_ID_CHUNK_SIZE = 100;
const TASK_ID_CHUNK_SIZE = 5;

interface FetchOptions {
  table: string;
  select: string;
  configure?: (query: any) => any;
  orderColumn?: string;
  ascending?: boolean;
  pageSize?: number;
  context?: string;
}

async function fetchPaged(options: FetchOptions): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = options.pageSize || PAGE_SIZE;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const page = await runWithTransientRetry(async () => {
      // 每次重试都重建查询构造器，避免复用已执行的PostgREST请求。
      let query = supabaseAdmin.from(options.table).select(options.select);
      if (options.configure) query = options.configure(query);
      if (options.orderColumn) query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return data || [];
    }, {
      context: `${options.context || options.table}，分页${from}-${to}`,
      maxAttempts: 3,
    });
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function fetchByStudentIds(
  table: string,
  select: string,
  foreignKey: string,
  studentIds: string[],
  options: { orderColumn?: string; pageSize?: number; chunkSize?: number } = {},
): Promise<any[]> {
  const result: any[] = [];
  for (const idChunk of chunks(studentIds, options.chunkSize || STUDENT_ID_CHUNK_SIZE)) {
    result.push(...await fetchPaged({
      table,
      select,
      configure: (query) => query.in(foreignKey, idChunk),
      orderColumn: options.orderColumn,
      pageSize: options.pageSize,
      context: `${table}，${foreignKey}批次[${idChunk.join(",")}]`,
    }));
  }
  return result;
}

async function fetchStudentTasks(studentIds: string[]): Promise<any[]> {
  // design_image可能包含大型base64数据。先读取轻量字段，再按少量任务ID分块读取图片，
  // 避免单条SQL同时扫描和返回数百个大型字段而触发Supabase语句超时。
  const tasks = await fetchByStudentIds(
    "student_tasks",
    "id,user_id,task_id,game_rules,game_name,design_reason,discussion_notes,revision_notes,duration_seconds,save_count,undo_count,created_at,updated_at",
    "user_id",
    studentIds,
    { orderColumn: "id", pageSize: 250, chunkSize: 50 },
  );
  if (!tasks.length) return [];

  const taskIds = tasks.map((task) => task.id);
  const imageRows = await fetchByStudentIds(
    "student_tasks",
    "id,design_image",
    "id",
    taskIds,
    { orderColumn: "id", pageSize: TASK_ID_CHUNK_SIZE + 1, chunkSize: TASK_ID_CHUNK_SIZE },
  );
  const imageByTaskId = new Map(imageRows.map((row) => [String(row.id), row.design_image]));
  if (imageByTaskId.size !== tasks.length) {
    throw new Error(`student_tasks: 轻量记录${tasks.length}条，但design_image记录仅${imageByTaskId.size}条`);
  }

  return tasks.map((task) => ({ ...task, design_image: imageByTaskId.get(String(task.id)) ?? null }));
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");
    const warnings: string[] = [];

    const students = await fetchPaged({
      table: "users",
      select: "id,name,student_id,grade,class_num,class_name,gender,srl_condition,created_at,updated_at",
      configure: (initialQuery) => {
        let query = initialQuery.eq("role", "student");
        if (grade) query = query.eq("grade", Number.parseInt(grade, 10));
        if (classNum) query = query.eq("class_num", Number.parseInt(classNum, 10));
        return query;
      },
      orderColumn: "student_id",
    });

    if (students.length === 0) {
      return NextResponse.json({ error: "没有符合条件的学生数据" }, { status: 404 });
    }

    const studentIds = students.map((student) => student.id);
    // student_tasks的design_image体积最大，先单独完成，避免与其他核心表并发争用
    // Supabase连接和传输资源。失败时立即终止，严禁继续生成残缺ZIP。
    const tasks = await fetchStudentTasks(studentIds);

    const [messages, conversations, projects, sharedItems, snapshots, groups, groupMembers, groupMessages, interactionEvents, gameEvents, peerReviews, classifications] = await Promise.all([
      fetchByStudentIds("messages", "id,user_id,role,content,created_at,session_id,input_method,has_code,ai_suggestion_type", "user_id", studentIds, { orderColumn: "id" }),
      fetchByStudentIds("conversations", "id,user_id,title,html_code,reflection,created_at,updated_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }),
      fetchByStudentIds("projects", "id,user_id,game_title,html_code,is_published,reflection,created_at,updated_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }),
      fetchByStudentIds("shared_items", "id,user_id,conversation_id,game_title,html_code,created_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }),
      fetchByStudentIds("game_snapshots", "id,user_id,conversation_id,html_code,created_at", "user_id", studentIds, { orderColumn: "id", pageSize: 250 }),
      fetchPaged({ table: "groups", select: "id,name,grade,class_num,created_at", orderColumn: "id" }),
      fetchByStudentIds("group_members", "group_id,user_id,joined_at", "user_id", studentIds, { orderColumn: "group_id" }),
      fetchByStudentIds("group_messages", "id,group_id,user_id,content,message_type,voice_url,voice_transcript,created_at", "user_id", studentIds, { orderColumn: "id" }),
      fetchByStudentIds("interaction_events", "id,user_id,session_id,event_type,metadata,created_at", "user_id", studentIds, { orderColumn: "id" }),
      fetchByStudentIds("game_events", "id,user_id,session_id,event_type,event_data,created_at", "user_id", studentIds, { orderColumn: "id" }),
      fetchByStudentIds("peer_reviews", "id,reviewer_id,reviewee_id,shared_item_id,q1_enjoy,q2_suggestion,q3_bug,created_at", "reviewer_id", studentIds, { orderColumn: "id" }),
      fetchByStudentIds("student_classifications", "id,user_id,conversation_id,q1_answers,q2_answer,q3_answer,q1_score,q2_score,q3_score,total_score,srl_group,total_time,created_at,test_type", "user_id", studentIds, { orderColumn: "id" }),
    ]);

    const data: ResearchExportData = {
      students,
      messages,
      conversations,
      projects,
      sharedItems,
      snapshots,
      tasks,
      groups,
      groupMembers,
      groupMessages,
      interactionEvents,
      gameEvents,
      peerReviews,
      classifications,
    };

    const exportResult = await buildResearchExport(data, warnings);
    // 以流式响应生成ZIP，避免同时在服务器内存中保留完整ZIP缓冲区，
    // 并持续向客户端发送数据，适配大型研究数据包。
    const zipStream = exportResult.zip.generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      compression: "DEFLATE",
      compressionOptions: { level: 3 },
    });
    const filename = researchExportFilename();

    return new NextResponse(Readable.toWeb(zipStream as unknown as Readable) as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="research_export.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: any) {
    console.error("[export-all] error:", error);
    return NextResponse.json({ error: error.message || "导出失败" }, { status: 500 });
  }
}
