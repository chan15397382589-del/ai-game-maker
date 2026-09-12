import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { buildResearchExport, researchExportFilename, type ResearchExportData } from "@/lib/admin-export";
import { supabaseAdmin } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 300;

const PAGE_SIZE = 1000;
const STUDENT_ID_CHUNK_SIZE = 100;

interface FetchOptions {
  table: string;
  select: string;
  configure?: (query: any) => any;
  orderColumn?: string;
  ascending?: boolean;
  pageSize?: number;
}

async function fetchPaged(options: FetchOptions): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = options.pageSize || PAGE_SIZE;

  for (let from = 0; ; from += pageSize) {
    let query = supabaseAdmin.from(options.table).select(options.select);
    if (options.configure) query = options.configure(query);
    if (options.orderColumn) query = query.order(options.orderColumn, { ascending: options.ascending ?? true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`${options.table}: ${error.message}`);
    const page = data || [];
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
  options: { orderColumn?: string; pageSize?: number } = {},
): Promise<any[]> {
  const result: any[] = [];
  for (const idChunk of chunks(studentIds, STUDENT_ID_CHUNK_SIZE)) {
    result.push(...await fetchPaged({
      table,
      select,
      configure: (query) => query.in(foreignKey, idChunk),
      orderColumn: options.orderColumn,
      pageSize: options.pageSize,
    }));
  }
  return result;
}

async function optionalQuery(name: string, query: Promise<any[]>, warnings: string[]): Promise<any[]> {
  try {
    return await query;
  } catch (error: any) {
    const message = `${name}读取失败：${error.message || String(error)}`;
    warnings.push(message);
    console.warn(`[export-all] ${message}`);
    return [];
  }
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
    const [messages, conversations, projects, sharedItems, snapshots, tasks, groups, groupMembers, groupMessages, interactionEvents, gameEvents, peerReviews, classifications] = await Promise.all([
      optionalQuery("messages", fetchByStudentIds("messages", "id,user_id,role,content,created_at,session_id,input_method,has_code,ai_suggestion_type", "user_id", studentIds, { orderColumn: "id" }), warnings),
      optionalQuery("conversations", fetchByStudentIds("conversations", "id,user_id,title,html_code,reflection,created_at,updated_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }), warnings),
      optionalQuery("projects", fetchByStudentIds("projects", "id,user_id,game_title,html_code,is_published,reflection,created_at,updated_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }), warnings),
      optionalQuery("shared_items", fetchByStudentIds("shared_items", "id,user_id,conversation_id,game_title,html_code,created_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }), warnings),
      optionalQuery("game_snapshots", fetchByStudentIds("game_snapshots", "id,user_id,conversation_id,html_code,created_at", "user_id", studentIds, { orderColumn: "id", pageSize: 250 }), warnings),
      optionalQuery("student_tasks", fetchByStudentIds("student_tasks", "id,user_id,task_id,design_image,game_rules,game_name,design_reason,discussion_notes,revision_notes,duration_seconds,save_count,undo_count,created_at,updated_at", "user_id", studentIds, { orderColumn: "id", pageSize: 500 }), warnings),
      optionalQuery("groups", fetchPaged({ table: "groups", select: "id,name,grade,class_num,created_at", orderColumn: "id" }), warnings),
      optionalQuery("group_members", fetchByStudentIds("group_members", "group_id,user_id,joined_at", "user_id", studentIds, { orderColumn: "group_id" }), warnings),
      optionalQuery("group_messages", fetchByStudentIds("group_messages", "id,group_id,user_id,content,message_type,voice_url,voice_transcript,created_at", "user_id", studentIds, { orderColumn: "id" }), warnings),
      optionalQuery("interaction_events", fetchByStudentIds("interaction_events", "id,user_id,session_id,event_type,metadata,created_at", "user_id", studentIds, { orderColumn: "id" }), warnings),
      optionalQuery("game_events", fetchByStudentIds("game_events", "id,user_id,session_id,event_type,event_data,created_at", "user_id", studentIds, { orderColumn: "id" }), warnings),
      optionalQuery("peer_reviews", fetchByStudentIds("peer_reviews", "id,reviewer_id,reviewee_id,shared_item_id,q1_enjoy,q2_suggestion,q3_bug,created_at", "reviewer_id", studentIds, { orderColumn: "id" }), warnings),
      optionalQuery("student_classifications", fetchByStudentIds("student_classifications", "id,user_id,conversation_id,q1_answers,q2_answer,q3_answer,q1_score,q2_score,q3_score,total_score,srl_group,total_time,created_at,test_type", "user_id", studentIds, { orderColumn: "id" }), warnings),
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
    const zipData = await exportResult.zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const filename = researchExportFilename();

    return new NextResponse(zipData as any, {
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
