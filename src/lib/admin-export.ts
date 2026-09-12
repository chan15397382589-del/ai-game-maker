import { createHash } from "node:crypto";
import JSZip from "jszip";

const TIME_ZONE = "Asia/Shanghai";

type Row = Record<string, any>;

export interface ResearchExportData {
  students: Row[];
  messages: Row[];
  conversations: Row[];
  projects: Row[];
  snapshots: Row[];
  tasks: Row[];
  groups: Row[];
  groupMembers: Row[];
  groupMessages: Row[];
  interactionEvents: Row[];
  gameEvents: Row[];
  peerReviews: Row[];
  classifications: Row[];
}

export interface ResearchExportResult {
  zip: JSZip;
  counts: Record<string, number>;
  warnings: string[];
}

interface FileIndexRow {
  平台: string;
  数据类型: string;
  来源表: string;
  记录ID: string;
  用户UUID: string;
  学生ID: string;
  姓名: string;
  年级: string;
  班级: string;
  组别ID: string;
  组别名称: string;
  会话ID: string;
  时间戳: string;
  活动日期: string;
  课时: string;
  关联方式: string;
  文件路径: string;
  SHA256: string;
}

function safeSegment(value: unknown, fallback = "unknown", maxLength = 80): string {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, maxLength);
  return cleaned || fallback;
}

function timestampParts(value: unknown) {
  const date = value ? new Date(String(value)) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    return { date: "日期未知", time: "时间未知", display: "", file: "time_unknown" };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}:${part("second")}`;
  return { date: day, time, display: `${day} ${time}`, file: `${day}_${time.replace(/:/g, "-")}` };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Row[], headers?: string[]): string {
  const columns = headers || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return map[mime.toLowerCase()] || "bin";
}

function decodeDataUrl(value: unknown): { bytes: Buffer; extension: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) return null;
  try {
    return { bytes: Buffer.from(match[2], "base64"), extension: extensionForMime(match[1]) };
  } catch {
    return null;
  }
}

export async function buildResearchExport(
  data: ResearchExportData,
  queryWarnings: string[] = [],
  generatedAt = new Date(),
): Promise<ResearchExportResult> {
  const zip = new JSZip();
  const warnings = [...queryWarnings];
  const fileIndex: FileIndexRow[] = [];
  const artifactIndex: Row[] = [];
  const messageIndex: Row[] = [];
  const groupMessageIndex: Row[] = [];
  const sessionFilePaths = new Map<string, string[]>();
  const conversationArtifactPaths = new Map<string, string[]>();

  const studentMap = new Map(data.students.map((student) => [student.id, student]));
  const groupMap = new Map(data.groups.map((group) => [group.id, group]));
  const membershipsByUser = new Map<string, Row[]>();
  for (const membership of data.groupMembers) {
    const group = groupMap.get(membership.group_id) || { id: membership.group_id, name: membership.group_id };
    const memberships = membershipsByUser.get(membership.user_id) || [];
    memberships.push(group);
    membershipsByUser.set(membership.user_id, memberships);
  }

  const identity = (userId: string) => {
    const student = studentMap.get(userId) || {};
    const groups = membershipsByUser.get(userId) || [];
    return {
      student,
      groupIds: groups.map((group) => group.id).join(" | "),
      groupNames: groups.map((group) => group.name).join(" | ") || "未分组",
    };
  };

  const classLabel = (student: Row) => {
    if (student.grade !== null && student.grade !== undefined && student.class_num !== null && student.class_num !== undefined) {
      return `${student.grade}年级_${student.class_num}班`;
    }
    return safeSegment(student.class_name, "班级未知");
  };

  const classKey = (student: Row) => `${student.grade ?? "unknown"}:${student.class_num ?? student.class_name ?? "unknown"}`;
  const activityDatesByClass = new Map<string, Set<string>>();
  const registerActivity = (userId: string, timestamp: unknown) => {
    const student = studentMap.get(userId);
    if (!student) return;
    const date = timestampParts(timestamp).date;
    if (date === "日期未知") return;
    const key = classKey(student);
    if (!activityDatesByClass.has(key)) activityDatesByClass.set(key, new Set());
    activityDatesByClass.get(key)!.add(date);
  };

  const timestampedSources: Array<[Row[], string]> = [
    [data.messages, "created_at"],
    [data.conversations, "created_at"],
    [data.projects, "created_at"],
    [data.snapshots, "created_at"],
    [data.tasks, "updated_at"],
    [data.groupMessages, "created_at"],
    [data.interactionEvents, "created_at"],
    [data.gameEvents, "created_at"],
  ];
  for (const [rows, timestampField] of timestampedSources) {
    for (const row of rows) registerActivity(row.user_id, row[timestampField]);
  }

  const lessonNumberByClassDate = new Map<string, number>();
  for (const [key, dates] of activityDatesByClass) {
    [...dates].sort().forEach((date, index) => lessonNumberByClassDate.set(`${key}:${date}`, index + 1));
  }

  const exportContext = (userId: string, timestamp: unknown) => {
    const { student, groupIds, groupNames } = identity(userId);
    const time = timestampParts(timestamp);
    const lessonNumber = lessonNumberByClassDate.get(`${classKey(student)}:${time.date}`);
    const lesson = lessonNumber ? `第${String(lessonNumber).padStart(2, "0")}课时` : "课时未知";
    const klass = classLabel(student);
    const studentFolder = `${safeSegment(student.student_id, "无学号")}_${safeSegment(student.name, "未知学生")}_${safeSegment(userId, "no_uuid", 12)}`;
    return {
      student,
      groupIds,
      groupNames,
      time,
      lesson,
      classFolder: safeSegment(klass),
      studentFolder,
      base: `01_按日期与班级/${time.date}/${safeSegment(klass)}/${lesson}`,
    };
  };

  const addIndexedFile = (
    path: string,
    content: string | Uint8Array,
    meta: Omit<FileIndexRow, "文件路径" | "SHA256">,
  ) => {
    zip.file(path, content);
    const hash = typeof content === "string"
      ? hashContent(content)
      : createHash("sha256").update(content).digest("hex");
    fileIndex.push({ ...meta, 文件路径: path, SHA256: hash });
  };

  const fileMeta = (
    platform: string,
    type: string,
    source: string,
    recordId: unknown,
    userId: string,
    timestamp: unknown,
    sessionId = "",
    relation = "",
  ): Omit<FileIndexRow, "文件路径" | "SHA256"> => {
    const context = exportContext(userId, timestamp);
    return {
      平台: platform,
      数据类型: type,
      来源表: source,
      记录ID: String(recordId ?? ""),
      用户UUID: userId,
      学生ID: String(context.student.student_id ?? ""),
      姓名: String(context.student.name ?? ""),
      年级: context.student.grade === null || context.student.grade === undefined ? "" : String(context.student.grade),
      班级: context.student.class_num === null || context.student.class_num === undefined ? String(context.student.class_name ?? "") : String(context.student.class_num),
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: sessionId,
      时间戳: context.time.display,
      活动日期: context.time.date,
      课时: context.lesson,
      关联方式: relation,
    };
  };

  // 学生—组别主索引。
  const studentRows = data.students.map((student) => {
    const groups = membershipsByUser.get(student.id) || [];
    return {
      用户UUID: student.id,
      学生ID: student.student_id,
      姓名: student.name,
      性别: student.gender || "",
      年级: student.grade ?? "",
      班级: student.class_num ?? student.class_name ?? "",
      实验组别: student.srl_condition || "未分组",
      小组ID: groups.map((group) => group.id).join(" | "),
      小组名称: groups.map((group) => group.name).join(" | ") || "未分组",
      注册时间: timestampParts(student.created_at).display,
    };
  });

  const membershipRows = data.groupMembers.map((membership) => {
    const student = studentMap.get(membership.user_id) || {};
    const group = groupMap.get(membership.group_id) || {};
    return {
      组别ID: membership.group_id,
      组别名称: group.name || "",
      组别年级: group.grade ?? "",
      组别班级: group.class_num ?? "",
      用户UUID: membership.user_id,
      学生ID: student.student_id || "",
      姓名: student.name || "",
      加入时间: timestampParts(membership.joined_at).display,
    };
  });

  const lessonRows: Row[] = [];
  for (const student of data.students) {
    const key = classKey(student);
    const dates = [...(activityDatesByClass.get(key) || [])].sort();
    dates.forEach((date, index) => lessonRows.push({
      年级: student.grade ?? "",
      班级: student.class_num ?? student.class_name ?? "",
      课时: `第${String(index + 1).padStart(2, "0")}课时`,
      活动日期: date,
    }));
  }
  const uniqueLessonRows = [...new Map(lessonRows.map((row) => [`${row.年级}:${row.班级}:${row.活动日期}`, row])).values()];

  // 学生与 AI 对话：按会话、日期拆分，保留完整消息正文。
  const messageGroups = new Map<string, Row[]>();
  const sessionMessages = new Map<string, Row[]>();
  for (const message of data.messages) {
    const sessionId = message.session_id || "无会话ID";
    const date = timestampParts(message.created_at).date;
    const dailyKey = `${message.user_id}:${sessionId}:${date}`;
    const sessionKey = `${message.user_id}:${sessionId}`;
    const daily = messageGroups.get(dailyKey) || [];
    daily.push(message);
    messageGroups.set(dailyKey, daily);
    const session = sessionMessages.get(sessionKey) || [];
    session.push(message);
    sessionMessages.set(sessionKey, session);
  }

  for (const rows of messageGroups.values()) {
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    const first = rows[0];
    const sessionId = first.session_id || "无会话ID";
    const context = exportContext(first.user_id, first.created_at);
    const sessionFolder = `session_${safeSegment(sessionId, "no_session", 40)}`;
    const folder = `${context.base}/01_AI对话平台/${context.studentFolder}/${sessionFolder}`;
    const fileBase = `${context.time.date}_${sessionFolder}`;
    const txtPath = `${folder}/${fileBase}_对话.txt`;
    const csvPath = `${folder}/${fileBase}_消息明细.csv`;
    const header = [
      `学生ID：${context.student.student_id || ""}`,
      `用户UUID：${first.user_id}`,
      `姓名：${context.student.name || ""}`,
      `年级班级：${classLabel(context.student)}`,
      `组别：${context.groupNames}（${context.groupIds || "无组别ID"}）`,
      `会话ID：${sessionId}`,
      `活动日期：${context.time.date}`,
      `课时：${context.lesson}`,
      `消息数：${rows.length}`,
      "",
    ];
    const body = rows.flatMap((message) => [
      `[${timestampParts(message.created_at).display}] [${message.role === "user" ? "学生" : "AI"}] [message_id=${message.id}]`,
      String(message.content || ""),
      "",
      "---",
      "",
    ]);
    const txt = [...header, ...body].join("\r\n");
    const meta = fileMeta("AI对话平台", "完整对话文本", "messages", `${sessionId}:${context.time.date}`, first.user_id, first.created_at, sessionId, "user_id + session_id + 活动日期");
    addIndexedFile(txtPath, txt, meta);

    const dailyRows = rows.map((message) => ({
      消息ID: message.id,
      用户UUID: message.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      年级: context.student.grade ?? "",
      班级: context.student.class_num ?? context.student.class_name ?? "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: sessionId,
      时间戳: timestampParts(message.created_at).display,
      活动日期: timestampParts(message.created_at).date,
      课时: context.lesson,
      角色: message.role === "user" ? "学生" : "AI",
      输入方式: message.input_method || "",
      含代码: message.has_code ?? "",
      AI建议类型: message.ai_suggestion_type || "",
      对话内容: message.content || "",
      对话文件路径: txtPath,
    }));
    addIndexedFile(csvPath, toCsv(dailyRows), fileMeta("AI对话平台", "消息明细CSV", "messages", `${sessionId}:${context.time.date}`, first.user_id, first.created_at, sessionId, "user_id + session_id + 活动日期"));
    messageIndex.push(...dailyRows);
    const paths = sessionFilePaths.get(`${first.user_id}:${sessionId}`) || [];
    paths.push(txtPath);
    sessionFilePaths.set(`${first.user_id}:${sessionId}`, paths);
  }

  // 阶段作品：对话当前版本、全部游戏快照与构思任务。
  const conversationById = new Map(data.conversations.map((conversation) => [conversation.id, conversation]));
  const conversationHashCandidates = new Map<string, Row[]>();
  const snapshotHashCandidates = new Map<string, Row[]>();
  for (const conversation of data.conversations) {
    if (!conversation.html_code) continue;
    const hash = hashContent(conversation.html_code);
    const key = `${conversation.user_id}:${hash}`;
    const candidates = conversationHashCandidates.get(key) || [];
    candidates.push(conversation);
    conversationHashCandidates.set(key, candidates);
    const timestamp = conversation.updated_at || conversation.created_at;
    const context = exportContext(conversation.user_id, timestamp);
    const sessionFolder = `session_${safeSegment(conversation.id, "no_session", 40)}`;
    const path = `${context.base}/03_阶段作品平台/${context.studentFolder}/${sessionFolder}/current_${context.time.file}_${safeSegment(conversation.title, "未命名游戏")}.html`;
    addIndexedFile(path, conversation.html_code, fileMeta("阶段作品平台", "会话当前游戏版本", "conversations", conversation.id, conversation.user_id, timestamp, conversation.id, "conversations.id = messages.session_id"));
    conversationArtifactPaths.set(conversation.id, [...(conversationArtifactPaths.get(conversation.id) || []), path]);
    artifactIndex.push({
      作品阶段: "阶段作品-会话当前版本",
      来源表: "conversations",
      作品ID: conversation.id,
      用户UUID: conversation.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: conversation.id,
      标题: conversation.title || "",
      时间戳: context.time.display,
      活动日期: context.time.date,
      课时: context.lesson,
      HTML_SHA256: hash,
      关联方式: "conversations.id = messages.session_id",
      文件路径: path,
    });
  }

  const snapshotsByConversation = new Map<string, Row[]>();
  for (const snapshot of data.snapshots) {
    const key = `${snapshot.user_id}:${snapshot.conversation_id || "无会话ID"}`;
    const rows = snapshotsByConversation.get(key) || [];
    rows.push(snapshot);
    snapshotsByConversation.set(key, rows);
  }
  for (const snapshots of snapshotsByConversation.values()) {
    snapshots.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    snapshots.forEach((snapshot, index) => {
      const context = exportContext(snapshot.user_id, snapshot.created_at);
      const conversationId = snapshot.conversation_id || "无会话ID";
      const hash = hashContent(snapshot.html_code || "");
      const hashKey = `${snapshot.user_id}:${hash}`;
      snapshotHashCandidates.set(hashKey, [...(snapshotHashCandidates.get(hashKey) || []), snapshot]);
      const sessionFolder = `session_${safeSegment(conversationId, "no_session", 40)}`;
      const path = `${context.base}/03_阶段作品平台/${context.studentFolder}/${sessionFolder}/snapshot_${String(index + 1).padStart(3, "0")}_${context.time.file}_id-${snapshot.id}.html`;
      addIndexedFile(path, snapshot.html_code || "", fileMeta("阶段作品平台", "游戏版本快照", "game_snapshots", snapshot.id, snapshot.user_id, snapshot.created_at, conversationId, "game_snapshots.conversation_id = conversations.id"));
      if (snapshot.conversation_id) conversationArtifactPaths.set(snapshot.conversation_id, [...(conversationArtifactPaths.get(snapshot.conversation_id) || []), path]);
      artifactIndex.push({
        作品阶段: "阶段作品-游戏快照",
        来源表: "game_snapshots",
        作品ID: snapshot.id,
        用户UUID: snapshot.user_id,
        学生ID: context.student.student_id || "",
        姓名: context.student.name || "",
        组别ID: context.groupIds,
        组别名称: context.groupNames,
        会话ID: conversationId,
        标题: conversationById.get(snapshot.conversation_id)?.title || "",
        时间戳: context.time.display,
        活动日期: context.time.date,
        课时: context.lesson,
        HTML_SHA256: hash,
        关联方式: "game_snapshots.conversation_id = conversations.id",
        文件路径: path,
      });
    });
  }

  for (const task of data.tasks) {
    if (task.task_id === "survey") continue;
    const timestamp = task.updated_at || task.created_at;
    const context = exportContext(task.user_id, timestamp);
    const folder = `${context.base}/03_阶段作品平台/${context.studentFolder}/构思与任务`;
    const baseName = `task_${safeSegment(task.task_id)}_${context.time.file}_id-${task.id}`;
    const taskPayload = {
      record_id: task.id,
      user_id: task.user_id,
      student_id: context.student.student_id || "",
      student_name: context.student.name || "",
      grade: context.student.grade ?? null,
      class_num: context.student.class_num ?? null,
      group_ids: context.groupIds,
      group_names: context.groupNames,
      lesson: context.lesson,
      activity_date: context.time.date,
      task_id: task.task_id,
      game_name: task.game_name,
      game_rules: normalizeJson(task.game_rules),
      design_reason: normalizeJson(task.design_reason),
      discussion_notes: task.discussion_notes,
      revision_notes: normalizeJson(task.revision_notes),
      duration_seconds: task.duration_seconds,
      save_count: task.save_count,
      undo_count: task.undo_count,
      design_image_source: typeof task.design_image === "string" && task.design_image.startsWith("data:") ? "同目录设计图文件" : task.design_image || null,
      created_at: task.created_at,
      updated_at: task.updated_at,
    };
    const jsonPath = `${folder}/${baseName}.json`;
    addIndexedFile(jsonPath, JSON.stringify(taskPayload, null, 2), fileMeta("阶段作品平台", "构思任务数据", "student_tasks", task.id, task.user_id, timestamp, "", "student_tasks.user_id = users.id"));
    const image = decodeDataUrl(task.design_image);
    if (image) {
      const imagePath = `${folder}/${baseName}_设计图.${image.extension}`;
      addIndexedFile(imagePath, image.bytes, fileMeta("阶段作品平台", "阶段设计图", "student_tasks", task.id, task.user_id, timestamp, "", "student_tasks.user_id = users.id"));
    }
  }

  // 最终作品：projects 表。若没有 conversation_id，则只用完全相同的 HTML 哈希建立确定性关联。
  for (const project of data.projects) {
    const timestamp = project.updated_at || project.created_at;
    const context = exportContext(project.user_id, timestamp);
    const hash = hashContent(project.html_code || "");
    const hashKey = `${project.user_id}:${hash}`;
    const matchingConversations = conversationHashCandidates.get(hashKey) || [];
    const matchingSnapshots = snapshotHashCandidates.get(hashKey) || [];
    const matchedConversation = matchingConversations
      .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0]
      || (matchingSnapshots.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.conversation_id
        ? conversationById.get(matchingSnapshots[0].conversation_id)
        : null);
    const linkedConversationId = matchedConversation?.id || matchingSnapshots[0]?.conversation_id || "";
    const relation = linkedConversationId ? "同一学生且HTML_SHA256完全一致" : "仅通过用户UUID关联；projects表没有conversation_id";
    const path = `${context.base}/04_最终作品平台/${context.studentFolder}/project_${safeSegment(project.id)}_${context.time.file}_${safeSegment(project.game_title, "未命名游戏")}.html`;
    addIndexedFile(path, project.html_code || "", fileMeta("最终作品平台", "最终游戏作品", "projects", project.id, project.user_id, timestamp, linkedConversationId, relation));
    artifactIndex.push({
      作品阶段: "最终作品",
      来源表: "projects",
      作品ID: project.id,
      用户UUID: project.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: linkedConversationId,
      标题: project.game_title || "",
      是否发布: project.is_published ?? "",
      时间戳: context.time.display,
      活动日期: context.time.date,
      课时: context.lesson,
      HTML_SHA256: hash,
      关联方式: relation,
      文件路径: path,
    });
  }

  // 小组协作对话：按组别和活动日期拆分，同时保留每条消息的学生身份。
  const groupDailyMessages = new Map<string, Row[]>();
  for (const message of data.groupMessages) {
    const date = timestampParts(message.created_at).date;
    const key = `${message.group_id}:${date}`;
    const rows = groupDailyMessages.get(key) || [];
    rows.push(message);
    groupDailyMessages.set(key, rows);
  }
  for (const rows of groupDailyMessages.values()) {
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    const first = rows[0];
    const group = groupMap.get(first.group_id) || {};
    const context = exportContext(first.user_id, first.created_at);
    const groupFolder = `${safeSegment(first.group_id)}_${safeSegment(group.name, "未命名小组")}`;
    const folder = `${context.base}/02_小组协作平台/${groupFolder}`;
    const txtPath = `${folder}/${context.time.date}_小组对话.txt`;
    const csvPath = `${folder}/${context.time.date}_小组消息明细.csv`;
    const detailRows = rows.map((message) => {
      const member = identity(message.user_id);
      const lessonContext = exportContext(message.user_id, message.created_at);
      return {
        消息ID: message.id,
        组别ID: message.group_id,
        组别名称: group.name || "",
        用户UUID: message.user_id,
        学生ID: member.student.student_id || "",
        姓名: member.student.name || "",
        年级: member.student.grade ?? "",
        班级: member.student.class_num ?? member.student.class_name ?? "",
        时间戳: timestampParts(message.created_at).display,
        活动日期: timestampParts(message.created_at).date,
        课时: lessonContext.lesson,
        消息类型: message.message_type || "",
        内容: message.content || "",
        语音转写: message.voice_transcript || "",
        语音URL: message.voice_url || "",
        对话文件路径: txtPath,
      };
    });
    const txt = [
      `组别ID：${first.group_id}`,
      `组别名称：${group.name || ""}`,
      `年级班级：${context.classFolder}`,
      `活动日期：${context.time.date}`,
      `课时：${context.lesson}`,
      `消息数：${rows.length}`,
      "",
      ...rows.flatMap((message) => {
        const member = identity(message.user_id);
        return [
          `[${timestampParts(message.created_at).display}] [${member.student.student_id || ""}] [${member.student.name || ""}] [message_id=${message.id}]`,
          String(message.voice_transcript || message.content || ""),
          "",
          "---",
          "",
        ];
      }),
    ].join("\r\n");
    addIndexedFile(txtPath, txt, fileMeta("小组协作平台", "小组完整对话", "group_messages", `${first.group_id}:${context.time.date}`, first.user_id, first.created_at, "", "group_id + 活动日期"));
    addIndexedFile(csvPath, toCsv(detailRows), fileMeta("小组协作平台", "小组消息明细CSV", "group_messages", `${first.group_id}:${context.time.date}`, first.user_id, first.created_at, "", "group_id + 活动日期"));
    groupMessageIndex.push(...detailRows);
  }

  // 平台行为：按学生和日期合并两类事件，保留 session_id。
  const eventGroups = new Map<string, Row[]>();
  for (const [source, rows] of [["interaction_events", data.interactionEvents], ["game_events", data.gameEvents]] as Array<[string, Row[]]>) {
    for (const event of rows) {
      const date = timestampParts(event.created_at).date;
      const key = `${event.user_id}:${date}`;
      const group = eventGroups.get(key) || [];
      group.push({ ...event, __source: source });
      eventGroups.set(key, group);
    }
  }
  for (const events of eventGroups.values()) {
    events.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    const first = events[0];
    const context = exportContext(first.user_id, first.created_at);
    const path = `${context.base}/05_平台行为/${context.studentFolder}/${context.time.date}_平台事件.csv`;
    const rows = events.map((event) => ({
      来源表: event.__source,
      事件ID: event.id,
      用户UUID: event.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: event.session_id || "",
      时间戳: timestampParts(event.created_at).display,
      活动日期: timestampParts(event.created_at).date,
      课时: context.lesson,
      事件类型: event.event_type,
      事件数据: event.metadata ?? event.event_data ?? {},
    }));
    addIndexedFile(path, toCsv(rows), fileMeta("平台行为", "交互与游戏事件", "interaction_events + game_events", `${first.user_id}:${context.time.date}`, first.user_id, first.created_at, "", "user_id + session_id + 活动日期"));
  }

  // 会话索引在作品文件完成后生成，确保可直接定位全部关联文件。
  const conversationIds = new Set(data.conversations.map((conversation) => conversation.id));
  const sessionKeys = new Set([...sessionMessages.keys(), ...data.conversations.map((conversation) => `${conversation.user_id}:${conversation.id}`)]);
  const sessionRows: Row[] = [];
  for (const sessionKey of sessionKeys) {
    const splitAt = sessionKey.indexOf(":");
    const userId = sessionKey.slice(0, splitAt);
    const sessionId = sessionKey.slice(splitAt + 1);
    const rows = (sessionMessages.get(sessionKey) || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const conversation = conversationIds.has(sessionId) ? conversationById.get(sessionId) : null;
    const firstTimestamp = rows[0]?.created_at || conversation?.created_at;
    const lastTimestamp = rows[rows.length - 1]?.created_at || conversation?.updated_at;
    const context = exportContext(userId, firstTimestamp);
    const snapshots = data.snapshots.filter((snapshot) => snapshot.user_id === userId && snapshot.conversation_id === sessionId);
    const projects = artifactIndex.filter((artifact) => artifact.来源表 === "projects" && artifact.用户UUID === userId && artifact.会话ID === sessionId);
    sessionRows.push({
      用户UUID: userId,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      年级: context.student.grade ?? "",
      班级: context.student.class_num ?? context.student.class_name ?? "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: sessionId,
      会话标题: conversation?.title || "",
      首条消息时间: timestampParts(firstTimestamp).display,
      末条消息时间: timestampParts(lastTimestamp).display,
      活动日期列表: [...new Set(rows.map((row) => timestampParts(row.created_at).date))].join(" | "),
      消息数: rows.length,
      学生消息数: rows.filter((row) => row.role === "user").length,
      AI消息数: rows.filter((row) => row.role === "assistant").length,
      阶段快照数: snapshots.length,
      关联最终作品数: projects.length,
      对话文件路径: (sessionFilePaths.get(sessionKey) || []).join(" | "),
      阶段作品文件路径: (conversationArtifactPaths.get(sessionId) || []).join(" | "),
      最终作品文件路径: projects.map((project) => project.文件路径).join(" | "),
    });
  }

  const surveyRows = data.tasks.filter((task) => task.task_id === "survey").map((task) => {
    const context = exportContext(task.user_id, task.updated_at || task.created_at);
    return {
      用户UUID: task.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      年级: context.student.grade ?? "",
      班级: context.student.class_num ?? context.student.class_name ?? "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      提交时间: context.time.display,
      问卷数据: normalizeJson(task.design_reason),
    };
  });

  const reflectionRows: Row[] = [];
  for (const conversation of data.conversations.filter((row) => row.reflection)) {
    const context = exportContext(conversation.user_id, conversation.updated_at || conversation.created_at);
    reflectionRows.push({ 来源表: "conversations", 记录ID: conversation.id, 用户UUID: conversation.user_id, 学生ID: context.student.student_id || "", 姓名: context.student.name || "", 会话ID: conversation.id, 时间戳: context.time.display, 反思数据: normalizeJson(conversation.reflection) });
  }
  for (const project of data.projects.filter((row) => row.reflection)) {
    const context = exportContext(project.user_id, project.updated_at || project.created_at);
    reflectionRows.push({ 来源表: "projects", 记录ID: project.id, 用户UUID: project.user_id, 学生ID: context.student.student_id || "", 姓名: context.student.name || "", 会话ID: "", 时间戳: context.time.display, 反思数据: normalizeJson(project.reflection) });
  }

  const peerReviewRows = data.peerReviews.map((review) => {
    const reviewer = identity(review.reviewer_id);
    const reviewee = identity(review.reviewee_id);
    return {
      评价ID: review.id,
      评价者用户UUID: review.reviewer_id,
      评价者学生ID: reviewer.student.student_id || "",
      评价者姓名: reviewer.student.name || "",
      被评价者用户UUID: review.reviewee_id,
      被评价者学生ID: reviewee.student.student_id || "",
      被评价者姓名: reviewee.student.name || "",
      共享作品ID: review.shared_item_id || "",
      好玩之处: review.q1_enjoy || "",
      建议: review.q2_suggestion || "",
      问题: review.q3_bug || "",
      时间戳: timestampParts(review.created_at).display,
    };
  });

  const classificationRows = data.classifications.map((classification) => {
    const context = exportContext(classification.user_id, classification.created_at);
    return {
      分类记录ID: classification.id,
      用户UUID: classification.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      会话ID: classification.conversation_id || "",
      测试类型: classification.test_type || "",
      SRL组别: classification.srl_group || "",
      Q1答案: classification.q1_answers,
      Q2答案: classification.q2_answer,
      Q3答案: classification.q3_answer,
      Q1得分: classification.q1_score,
      Q2得分: classification.q2_score,
      Q3得分: classification.q3_score,
      总分: classification.total_score,
      总用时: classification.total_time,
      时间戳: timestampParts(classification.created_at).display,
    };
  });

  const countRows = [
    ["users", data.students.length],
    ["messages", data.messages.length],
    ["conversations", data.conversations.length],
    ["game_snapshots", data.snapshots.length],
    ["projects", data.projects.length],
    ["student_tasks", data.tasks.length],
    ["groups", data.groups.length],
    ["group_members", data.groupMembers.length],
    ["group_messages", data.groupMessages.length],
    ["interaction_events", data.interactionEvents.length],
    ["game_events", data.gameEvents.length],
    ["peer_reviews", data.peerReviews.length],
    ["student_classifications", data.classifications.length],
  ].map(([table, count]) => ({ 数据表: table, 记录数: count }));

  zip.file("00_索引/学生主索引.csv", toCsv(studentRows));
  zip.file("00_索引/组别成员索引.csv", toCsv(membershipRows));
  zip.file("00_索引/课时映射.csv", toCsv(uniqueLessonRows));
  zip.file("00_索引/会话关联索引.csv", toCsv(sessionRows));
  zip.file("00_索引/消息明细索引.csv", toCsv(messageIndex));
  zip.file("00_索引/小组消息明细索引.csv", toCsv(groupMessageIndex));
  zip.file("00_索引/作品关联索引.csv", toCsv(artifactIndex));
  zip.file("00_索引/文件关联索引.csv", toCsv(fileIndex));
  zip.file("00_索引/数据表计数.csv", toCsv(countRows));
  zip.file("00_汇总数据/前测数据.csv", toCsv(surveyRows));
  zip.file("00_汇总数据/同伴互评.csv", toCsv(peerReviewRows));
  zip.file("00_汇总数据/学生反思.csv", toCsv(reflectionRows));
  zip.file("00_汇总数据/学生分类评估.csv", toCsv(classificationRows));

  const generated = timestampParts(generatedAt.toISOString()).display;
  const readme = [
    "AI游戏课堂研究数据导出包",
    "",
    `生成时间：${generated}（${TIME_ZONE}）`,
    `学生数：${data.students.length}`,
    `AI对话消息数：${data.messages.length}`,
    `阶段游戏快照数：${data.snapshots.length}`,
    `最终作品数：${data.projects.length}`,
    "",
    "目录说明：",
    "1. 00_索引：学生、组别、课时、会话、消息、作品和文件之间的完整对应关系。",
    "2. 00_汇总数据：前测、互评、反思和分类评估。",
    "3. 01_按日期与班级：日期 → 班级 → 课时 → 平台 → 学生/小组的分层文件。",
    "",
    "课时推导规则：",
    "数据库当前没有显式 lesson_id。导出程序按同一班级发生数据活动的日期升序自动编号为第01课时、第02课时……。",
    "因此课时是可复核的日期级推导值，不代表同一天内的具体节次。",
    "",
    "平台划分规则：",
    "AI对话平台 = messages；小组协作平台 = group_messages；阶段作品平台 = conversations 当前HTML、game_snapshots 与 student_tasks；最终作品平台 = projects；平台行为 = interaction_events 与 game_events。",
    "",
    "作品关联规则：",
    "game_snapshots 通过 conversation_id 与会话精确关联。projects 表没有 conversation_id；只有当同一学生的 HTML SHA256 完全一致时才建立会话关联，否则仅保留用户UUID/学生ID关联，不进行推测。",
    "",
    "完整性说明：",
    "对话正文和HTML作品均完整导出，不截断。文件名包含记录ID或会话ID以避免同名覆盖。CSV采用UTF-8 BOM，便于Excel直接打开。",
    warnings.length ? `\n查询警告：\n- ${warnings.join("\n- ")}` : "\n查询警告：无",
  ].join("\r\n");
  zip.file("导出说明.txt", readme);
  zip.file("00_索引/数据完整性汇总.json", JSON.stringify({
    generated_at: generatedAt.toISOString(),
    timezone: TIME_ZONE,
    counts: Object.fromEntries(countRows.map((row) => [row.数据表, row.记录数])),
    exported_files: fileIndex.length,
    lesson_mapping_count: uniqueLessonRows.length,
    session_count: sessionRows.length,
    warnings,
  }, null, 2));

  return {
    zip,
    counts: {
      students: data.students.length,
      messages: data.messages.length,
      conversations: data.conversations.length,
      snapshots: data.snapshots.length,
      finalProjects: data.projects.length,
      indexedFiles: fileIndex.length,
      sessions: sessionRows.length,
    },
    warnings,
  };
}

export function researchExportFilename(date = new Date()): string {
  return `AI游戏课堂_研究数据包_${timestampParts(date.toISOString()).date}.zip`;
}
