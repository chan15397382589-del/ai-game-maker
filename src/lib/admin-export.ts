import { createHash } from "node:crypto";
import JSZip from "jszip";

const TIME_ZONE = "Asia/Shanghai";
const LEGACY_SESSION_GAP_MS = 30 * 60 * 1000;

type Row = Record<string, any>;

export interface ResearchExportData {
  students: Row[];
  messages: Row[];
  conversations: Row[];
  projects: Row[];
  sharedItems?: Row[];
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
  原始会话ID: string;
  时间戳: string;
  活动日期: string;
  课时: string;
  关联方式: string;
  关联置信度: string;
  文件路径: string;
  SHA256: string;
}

interface ExportSession {
  key: string;
  userId: string;
  sessionId: string;
  originalSessionId: string;
  relation: string;
  confidence: "高" | "中" | "低";
  messages: Row[];
  firstAt: string;
  lastAt: string;
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

function normalizedHtmlHash(content: unknown): string {
  const normalized = String(content || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
  return hashContent(normalized);
}

function extractHtmlFromMessage(content: unknown): string {
  const text = String(content || "");
  const htmlFence = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlFence) return htmlFence[1].trim();
  const genericFence = text.match(/```\s*([\s\S]*?)```/);
  if (genericFence && /<!doctype|<html/i.test(genericFence[1])) return genericFence[1].trim();
  const start = text.search(/<!doctype|<html/i);
  const end = text.toLowerCase().lastIndexOf("</html>");
  return start >= 0 && end >= start ? text.slice(start, end + 7).trim() : "";
}

function buildMessageSessions(messages: Row[]): { sessions: ExportSession[]; messages: Row[] } {
  const sessions: ExportSession[] = [];
  const exportedMessages: Row[] = [];
  const messagesByUser = new Map<string, Row[]>();
  for (const message of messages) {
    const rows = messagesByUser.get(message.user_id) || [];
    rows.push(message);
    messagesByUser.set(message.user_id, rows);
  }

  const addSession = (
    userId: string,
    sessionId: string,
    originalSessionId: string,
    rows: Row[],
    relation: string,
    confidence: "高" | "中" | "低",
  ) => {
    if (!rows.length) return;
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    const normalizedRows: Row[] = rows.map((message) => ({
      ...message,
      __session_id: sessionId,
      __session_relation: relation,
      __session_confidence: confidence,
    }));
    sessions.push({
      key: `${userId}:${sessionId}`,
      userId,
      sessionId,
      originalSessionId,
      relation,
      confidence,
      messages: normalizedRows,
      firstAt: normalizedRows[0].created_at,
      lastAt: normalizedRows[normalizedRows.length - 1].created_at,
    });
    exportedMessages.push(...normalizedRows);
  };

  for (const [userId, userMessages] of messagesByUser) {
    const explicitGroups = new Map<string, Row[]>();
    const legacyRows: Row[] = [];
    for (const message of userMessages) {
      if (message.session_id) {
        const sessionId = String(message.session_id);
        const rows = explicitGroups.get(sessionId) || [];
        rows.push(message);
        explicitGroups.set(sessionId, rows);
      } else {
        legacyRows.push(message);
      }
    }
    for (const [sessionId, rows] of explicitGroups) {
      addSession(userId, sessionId, sessionId, rows, "数据库原始session_id", "高");
    }

    legacyRows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    let cluster: Row[] = [];
    for (const message of legacyRows) {
      const previous = cluster[cluster.length - 1];
      const gap = previous ? new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() : 0;
      if (cluster.length && gap > LEGACY_SESSION_GAP_MS) {
        addSession(userId, `legacy_${cluster[0].id}`, "", cluster, "原始session_id为空；按同一学生30分钟消息间隔重建", "中");
        cluster = [];
      }
      cluster.push(message);
    }
    if (cluster.length) {
      addSession(userId, `legacy_${cluster[0].id}`, "", cluster, "原始session_id为空；按同一学生30分钟消息间隔重建", "中");
    }
  }

  return { sessions, messages: exportedMessages };
}

function buildDialoguePairs(messages: Row[], sessionId: string): Row[] {
  const pairs: Row[] = [];
  let studentMessages: Row[] = [];
  let aiMessages: Row[] = [];

  const flush = () => {
    if (!studentMessages.length && !aiMessages.length) return;
    const formatContent = (rows: Row[], label: string) => rows.map((message, index) => (
      `[${label}${index + 1}｜${timestampParts(message.created_at).display}｜ID:${message.id}]\n${message.content || ""}`
    )).join("\n\n");
    pairs.push({
      对话轮次: pairs.length + 1,
      会话ID: sessionId,
      学生消息数: studentMessages.length,
      学生消息ID: studentMessages.map((message) => message.id).join(" | "),
      学生发送时间: studentMessages.map((message) => timestampParts(message.created_at).display).join(" | "),
      学生发言原文: formatContent(studentMessages, "学生发言"),
      AI消息数: aiMessages.length,
      AI消息ID: aiMessages.map((message) => message.id).join(" | "),
      AI回复时间: aiMessages.map((message) => timestampParts(message.created_at).display).join(" | "),
      AI回复原文: formatContent(aiMessages, "AI回复"),
      回复状态: studentMessages.length === 0 ? "AI主动消息" : aiMessages.length === 0 ? "学生发言尚无AI回复" : "已回复",
    });
    studentMessages = [];
    aiMessages = [];
  };

  for (const message of messages) {
    if (message.role === "user") {
      if (aiMessages.length) flush();
      studentMessages.push(message);
    } else {
      aiMessages.push(message);
    }
  }
  flush();
  return pairs;
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
  const integrityIssues: Row[] = [];
  const sessionFilePaths = new Map<string, string[]>();

  const studentMap = new Map(data.students.map((student) => [student.id, student]));
  const groupMap = new Map(data.groups.map((group) => [group.id, group]));
  const sessionBuild = buildMessageSessions(data.messages);
  const exportMessages = sessionBuild.messages;
  const sessionsByKey = new Map(sessionBuild.sessions.map((session) => [session.key, session]));
  const sessionsByUser = new Map<string, ExportSession[]>();
  for (const session of sessionBuild.sessions) {
    const sessions = sessionsByUser.get(session.userId) || [];
    sessions.push(session);
    sessionsByUser.set(session.userId, sessions);
  }
  const snapshotsByConversationForLink = new Map<string, Row[]>();
  for (const snapshot of data.snapshots) {
    if (!snapshot.conversation_id) continue;
    const rows = snapshotsByConversationForLink.get(snapshot.conversation_id) || [];
    rows.push(snapshot);
    snapshotsByConversationForLink.set(snapshot.conversation_id, rows);
  }
  const conversationSessionLinks = new Map<string, { session: ExportSession; relation: string; confidence: "高" | "中" | "低" }>();
  const claimedSessionKeys = new Set<string>();
  for (const conversation of data.conversations) {
    const session = sessionsByKey.get(`${conversation.user_id}:${conversation.id}`);
    if (!session) continue;
    conversationSessionLinks.set(conversation.id, {
      session,
      relation: "conversations.id = messages.session_id",
      confidence: "高",
    });
    claimedSessionKeys.add(session.key);
  }

  const unmatchedConversations = data.conversations
    .filter((conversation) => !conversationSessionLinks.has(conversation.id))
    .sort((a, b) => {
      const aHasArtifact = a.html_code || snapshotsByConversationForLink.has(a.id) ? 1 : 0;
      const bHasArtifact = b.html_code || snapshotsByConversationForLink.has(b.id) ? 1 : 0;
      return bHasArtifact - aHasArtifact || String(a.created_at).localeCompare(String(b.created_at));
    });
  for (const conversation of unmatchedConversations) {
    const referenceTimes = [
      conversation.created_at,
      ...(snapshotsByConversationForLink.get(conversation.id) || []).map((snapshot) => snapshot.created_at),
    ].filter(Boolean);
    const referenceDates = new Set(referenceTimes.map((value) => timestampParts(value).date));
    const candidates = (sessionsByUser.get(conversation.user_id) || [])
      .filter((session) => !claimedSessionKeys.has(session.key) && referenceDates.has(timestampParts(session.firstAt).date))
      .sort((a, b) => {
        const distance = (session: ExportSession) => Math.min(...referenceTimes.map((value) => Math.abs(new Date(session.firstAt).getTime() - new Date(value).getTime())));
        return distance(a) - distance(b);
      });
    if (!candidates.length) continue;
    const session = candidates[0];
    conversationSessionLinks.set(conversation.id, {
      session,
      relation: `${session.relation}；同一学生、同一日期、时间最近的一对一关联`,
      confidence: "中",
    });
    claimedSessionKeys.add(session.key);
  }
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

  for (const conversation of data.conversations.filter((row) => !conversationSessionLinks.has(row.id))) {
    const student = studentMap.get(conversation.user_id) || {};
    integrityIssues.push({
      异常类型: "数据库会话没有可对应消息",
      来源表: "conversations",
      记录ID: conversation.id,
      用户UUID: conversation.user_id,
      学生ID: student.student_id || "",
      姓名: student.name || "",
      是否包含游戏: conversation.html_code ? "是" : "否",
      会话创建时间: timestampParts(conversation.created_at).display,
      会话更新时间: timestampParts(conversation.updated_at).display,
      建议: conversation.html_code ? "优先核查历史messages备份" : "可能是创建后未发言的空会话",
    });
  }

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
    const srlFolder = `SRL_${safeSegment(student.srl_condition, "组别未知")}`;
    const studentFolder = `${safeSegment(student.student_id, "无学号")}_${safeSegment(student.name, "未知学生")}_${safeSegment(userId, "no_uuid", 12)}`;
    return {
      student,
      groupIds,
      groupNames,
      time,
      lesson,
      classFolder: safeSegment(klass),
      srlFolder,
      studentFolder,
      base: `01_按班级/${safeSegment(klass)}/${srlFolder}/${studentFolder}/${time.date}`,
    };
  };

  const studentRoot = (context: ReturnType<typeof exportContext>) => (
    `01_按班级/${context.classFolder}/${context.srlFolder}/${context.studentFolder}`
  );

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
    confidence = "",
    originalSessionId = "",
    archiveTimestamp: unknown = timestamp,
  ): Omit<FileIndexRow, "文件路径" | "SHA256"> => {
    const context = exportContext(userId, archiveTimestamp);
    const sourceTime = timestampParts(timestamp);
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
      原始会话ID: originalSessionId,
      时间戳: sourceTime.display,
      活动日期: context.time.date,
      课时: context.lesson,
      关联方式: relation,
      关联置信度: confidence,
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
  for (const message of exportMessages) {
    const sessionId = message.__session_id;
    const date = timestampParts(message.created_at).date;
    const dailyKey = `${message.user_id}:${sessionId}:${date}`;
    const daily = messageGroups.get(dailyKey) || [];
    daily.push(message);
    messageGroups.set(dailyKey, daily);
  }

  for (const rows of messageGroups.values()) {
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    const first = rows[0];
    const sessionId = first.__session_id;
    const context = exportContext(first.user_id, first.created_at);
    const sessionFolder = `session_${safeSegment(sessionId, "no_session", 40)}`;
    const fileBase = `AI对话_${sessionFolder}`;
    const txtPath = `${context.base}/${fileBase}.txt`;
    const pairCsvPath = `${context.base}/${fileBase}_对话配对.csv`;
    const rawCsvPath = `${context.base}/${fileBase}_逐条消息.csv`;
    const header = [
      `学生ID：${context.student.student_id || ""}`,
      `用户UUID：${first.user_id}`,
      `姓名：${context.student.name || ""}`,
      `年级班级：${classLabel(context.student)}`,
      `组别：${context.groupNames}（${context.groupIds || "无组别ID"}）`,
      `会话ID：${sessionId}`,
      `原始会话ID：${first.session_id || "空"}`,
      `会话识别规则：${first.__session_relation}`,
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
    const meta = fileMeta("AI对话平台", "完整对话文本", "messages", `${sessionId}:${context.time.date}`, first.user_id, first.created_at, sessionId, first.__session_relation, first.__session_confidence, first.session_id || "");
    addIndexedFile(txtPath, txt, meta);

    const dailyRows = rows.map((message, index) => ({
      消息序号: index + 1,
      消息ID: message.id,
      角色: message.role === "user" ? "学生" : "AI",
      时间戳: timestampParts(message.created_at).display,
      内容原文: message.content || "",
      内容SHA256: hashContent(message.content || ""),
      输入方式: message.input_method || "",
      含代码: message.has_code ?? "",
      AI建议类型: message.ai_suggestion_type || "",
      会话ID: sessionId,
      原始会话ID: message.session_id || "",
      会话识别规则: message.__session_relation,
      用户UUID: message.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      年级: context.student.grade ?? "",
      班级: context.student.class_num ?? context.student.class_name ?? "",
      SRL组别: context.student.srl_condition || "",
      小组ID: context.groupIds,
      小组名称: context.groupNames,
      活动日期: timestampParts(message.created_at).date,
      课时: context.lesson,
      对话文件路径: txtPath,
    }));
    const pairRows = buildDialoguePairs(rows, sessionId).map((pair) => ({
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      年级: context.student.grade ?? "",
      班级: context.student.class_num ?? context.student.class_name ?? "",
      SRL组别: context.student.srl_condition || "",
      活动日期: context.time.date,
      课时: context.lesson,
      ...pair,
    }));
    const messageMeta = fileMeta("AI对话平台", "结构化对话CSV", "messages", `${sessionId}:${context.time.date}`, first.user_id, first.created_at, sessionId, first.__session_relation, first.__session_confidence, first.session_id || "");
    addIndexedFile(pairCsvPath, toCsv(pairRows), { ...messageMeta, 数据类型: "学生-AI对话配对CSV" });
    addIndexedFile(rawCsvPath, toCsv(dailyRows), { ...messageMeta, 数据类型: "逐条消息审计CSV" });
    messageIndex.push(...dailyRows);
    const paths = sessionFilePaths.get(`${first.user_id}:${sessionId}`) || [];
    paths.push(txtPath, pairCsvPath, rawCsvPath);
    sessionFilePaths.set(`${first.user_id}:${sessionId}`, paths);
  }

  // 每名学生增加单一、完整的对话汇总，避免研究者在多个日期和会话文件间手工拼接。
  const studentSummaryPaths = new Map<string, string[]>();
  const completeDialogueMessageKeys = new Set<string>();
  let studentsWithCompleteDialogueFiles = 0;
  for (const [userId, userSessions] of sessionsByUser) {
    const sortedSessions = [...userSessions].sort((a, b) => (
      String(a.firstAt).localeCompare(String(b.firstAt)) || a.sessionId.localeCompare(b.sessionId)
    ));
    const allMessages = sortedSessions
      .flatMap((session) => session.messages)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
    if (!allMessages.length) continue;

    const first = allMessages[0];
    const context = exportContext(userId, first.created_at);
    const root = studentRoot(context);
    const fullTxtPath = `${root}/00_该学生全部AI对话.txt`;
    const fullPairPath = `${root}/00_该学生全部AI对话_配对.csv`;
    const fullMessagesPath = `${root}/00_该学生全部消息.csv`;
    const dates = [...new Set(allMessages.map((message) => timestampParts(message.created_at).date))];
    const header = [
      `学生ID：${context.student.student_id || ""}`,
      `用户UUID：${userId}`,
      `姓名：${context.student.name || ""}`,
      `年级班级：${classLabel(context.student)}`,
      `SRL组别：${context.student.srl_condition || "未分组"}`,
      `小组：${context.groupNames}（${context.groupIds || "无组别ID"}）`,
      `全部会话数：${sortedSessions.length}`,
      `全部消息数：${allMessages.length}`,
      `活动日期：${dates.join(" | ")}`,
      "说明：本文件按时间顺序汇总该学生在messages表中的全部学生与AI消息；日期和会话明细文件仍保留用于审计。",
      "",
    ];
    const body = allMessages.flatMap((message) => {
      const messageContext = exportContext(userId, message.created_at);
      return [
        `[${timestampParts(message.created_at).display}] [${message.role === "user" ? "学生" : "AI"}] [session_id=${message.__session_id}] [message_id=${message.id}] [${messageContext.lesson}]`,
        String(message.content || ""),
        "",
        "---",
        "",
      ];
    });
    const fullTxt = [...header, ...body].join("\r\n");

    const fullMessageRows = allMessages.map((message, index) => {
      const messageContext = exportContext(userId, message.created_at);
      completeDialogueMessageKeys.add(`${userId}:${message.id}`);
      return {
        学生内消息序号: index + 1,
        消息ID: message.id,
        角色: message.role === "user" ? "学生" : "AI",
        时间戳: timestampParts(message.created_at).display,
        内容原文: message.content || "",
        内容SHA256: hashContent(message.content || ""),
        输入方式: message.input_method || "",
        含代码: message.has_code ?? "",
        AI建议类型: message.ai_suggestion_type || "",
        会话ID: message.__session_id,
        原始会话ID: message.session_id || "",
        会话识别规则: message.__session_relation,
        用户UUID: userId,
        学生ID: context.student.student_id || "",
        姓名: context.student.name || "",
        年级: context.student.grade ?? "",
        班级: context.student.class_num ?? context.student.class_name ?? "",
        SRL组别: context.student.srl_condition || "",
        小组ID: context.groupIds,
        小组名称: context.groupNames,
        活动日期: messageContext.time.date,
        课时: messageContext.lesson,
      };
    });
    let studentPairSequence = 0;
    const fullPairRows = sortedSessions.flatMap((session) => {
      const sessionContext = exportContext(userId, session.firstAt);
      return buildDialoguePairs(session.messages, session.sessionId).map((pair) => ({
        学生汇总轮次: ++studentPairSequence,
        学生ID: context.student.student_id || "",
        姓名: context.student.name || "",
        年级: context.student.grade ?? "",
        班级: context.student.class_num ?? context.student.class_name ?? "",
        SRL组别: context.student.srl_condition || "",
        活动日期: sessionContext.time.date,
        课时: sessionContext.lesson,
        ...pair,
      }));
    });
    const summaryMeta = fileMeta(
      "AI对话平台",
      "学生全部对话汇总",
      "messages",
      userId,
      userId,
      first.created_at,
      "全部会话",
      "按messages.user_id汇总全部日期与会话",
      "高",
    );
    addIndexedFile(fullTxtPath, fullTxt, { ...summaryMeta, 数据类型: "学生全部对话TXT" });
    addIndexedFile(fullPairPath, toCsv(fullPairRows), { ...summaryMeta, 数据类型: "学生全部对话配对CSV" });
    addIndexedFile(fullMessagesPath, toCsv(fullMessageRows), { ...summaryMeta, 数据类型: "学生全部消息审计CSV" });
    studentSummaryPaths.set(userId, [fullTxtPath, fullPairPath, fullMessagesPath]);
    studentsWithCompleteDialogueFiles += 1;
  }

  const closestMessageTime = (session: ExportSession, timestamp: unknown): string => {
    const target = new Date(String(timestamp)).getTime();
    if (!Number.isFinite(target)) return session.firstAt;
    return session.messages.reduce((closest, message) => {
      const currentDistance = Math.abs(new Date(message.created_at).getTime() - target);
      const closestDistance = Math.abs(new Date(closest.created_at).getTime() - target);
      return currentDistance < closestDistance ? message : closest;
    }, session.messages[0]).created_at;
  };
  // 阶段作品：对话当前版本、全部游戏快照与构思任务。
  const conversationById = new Map(data.conversations.map((conversation) => [conversation.id, conversation]));
  const conversationHashCandidates = new Map<string, Row[]>();
  const conversationNormalizedHashCandidates = new Map<string, Row[]>();
  const snapshotHashCandidates = new Map<string, Row[]>();
  const snapshotNormalizedHashCandidates = new Map<string, Row[]>();
  for (const conversation of data.conversations) {
    if (!conversation.html_code) continue;
    const hash = hashContent(conversation.html_code);
    const key = `${conversation.user_id}:${hash}`;
    const candidates = conversationHashCandidates.get(key) || [];
    candidates.push(conversation);
    conversationHashCandidates.set(key, candidates);
    const normalizedKey = `${conversation.user_id}:${normalizedHtmlHash(conversation.html_code)}`;
    conversationNormalizedHashCandidates.set(normalizedKey, [...(conversationNormalizedHashCandidates.get(normalizedKey) || []), conversation]);
    const timestamp = conversation.updated_at || conversation.created_at;
    const sessionLink = conversationSessionLinks.get(conversation.id);
    const archiveTimestamp = sessionLink ? closestMessageTime(sessionLink.session, conversation.created_at || timestamp) : timestamp;
    const context = exportContext(conversation.user_id, archiveTimestamp);
    const effectiveSessionId = sessionLink?.session.sessionId || "未找到对话";
    const sessionFolder = `session_${safeSegment(effectiveSessionId, "no_session", 40)}`;
    const exceptionBase = `99_异常_有作品无对话/${context.classFolder}/${context.srlFolder}/${context.studentFolder}`;
    const base = sessionLink ? context.base : exceptionBase;
    const path = `${base}/对应阶段游戏_${sessionFolder}_${timestampParts(timestamp).file}_${safeSegment(conversation.title, "未命名游戏")}.html`;
    const relation = sessionLink?.relation || "未找到可与该阶段作品对应的学生-AI对话";
    const confidence = sessionLink?.confidence || "需人工核验";
    addIndexedFile(path, conversation.html_code, fileMeta("阶段作品平台", "会话当前游戏版本", "conversations", conversation.id, conversation.user_id, timestamp, effectiveSessionId, relation, confidence, sessionLink?.session.originalSessionId || "", archiveTimestamp));
    if (!sessionLink) integrityIssues.push({
      异常类型: "有阶段作品但未找到对话",
      来源表: "conversations",
      记录ID: conversation.id,
      用户UUID: conversation.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      作品时间: timestampParts(timestamp).display,
      文件路径: path,
      建议: "核查Supabase messages中该学生的历史记录或备份",
    });
    artifactIndex.push({
      作品阶段: "阶段作品-会话当前版本",
      来源表: "conversations",
      作品ID: conversation.id,
      用户UUID: conversation.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      数据库会话ID: conversation.id,
      对应对话会话ID: effectiveSessionId,
      标题: conversation.title || "",
      时间戳: timestampParts(timestamp).display,
      对话归档日期: context.time.date,
      课时: context.lesson,
      HTML_SHA256: hash,
      关联方式: relation,
      关联置信度: confidence,
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
      const conversationId = snapshot.conversation_id || "无会话ID";
      const sessionLink = snapshot.conversation_id ? conversationSessionLinks.get(snapshot.conversation_id) : undefined;
      const archiveTimestamp = sessionLink ? closestMessageTime(sessionLink.session, snapshot.created_at) : snapshot.created_at;
      const context = exportContext(snapshot.user_id, archiveTimestamp);
      const effectiveSessionId = sessionLink?.session.sessionId || "未找到对话";
      const hash = hashContent(snapshot.html_code || "");
      const hashKey = `${snapshot.user_id}:${hash}`;
      snapshotHashCandidates.set(hashKey, [...(snapshotHashCandidates.get(hashKey) || []), snapshot]);
      const normalizedHashKey = `${snapshot.user_id}:${normalizedHtmlHash(snapshot.html_code)}`;
      snapshotNormalizedHashCandidates.set(normalizedHashKey, [...(snapshotNormalizedHashCandidates.get(normalizedHashKey) || []), snapshot]);
      const sessionFolder = `session_${safeSegment(effectiveSessionId, "no_session", 40)}`;
      const exceptionBase = `99_异常_有作品无对话/${context.classFolder}/${context.srlFolder}/${context.studentFolder}`;
      const base = sessionLink ? context.base : exceptionBase;
      const path = `${base}/对应阶段游戏快照_${sessionFolder}_${String(index + 1).padStart(3, "0")}_${timestampParts(snapshot.created_at).file}_id-${snapshot.id}.html`;
      const relation = sessionLink ? `game_snapshots.conversation_id = conversations.id；${sessionLink.relation}` : "快照有conversation_id，但未找到可对应的学生-AI对话";
      const confidence = sessionLink?.confidence || "需人工核验";
      addIndexedFile(path, snapshot.html_code || "", fileMeta("阶段作品平台", "游戏版本快照", "game_snapshots", snapshot.id, snapshot.user_id, snapshot.created_at, effectiveSessionId, relation, confidence, sessionLink?.session.originalSessionId || "", archiveTimestamp));
      if (!sessionLink) integrityIssues.push({
        异常类型: "有游戏快照但未找到对话",
        来源表: "game_snapshots",
        记录ID: snapshot.id,
        用户UUID: snapshot.user_id,
        学生ID: context.student.student_id || "",
        姓名: context.student.name || "",
        数据库会话ID: conversationId,
        作品时间: timestampParts(snapshot.created_at).display,
        文件路径: path,
        建议: "核查conversation_id对应会话及messages历史记录",
      });
      artifactIndex.push({
        作品阶段: "阶段作品-游戏快照",
        来源表: "game_snapshots",
        作品ID: snapshot.id,
        用户UUID: snapshot.user_id,
        学生ID: context.student.student_id || "",
        姓名: context.student.name || "",
        组别ID: context.groupIds,
        组别名称: context.groupNames,
        数据库会话ID: conversationId,
        对应对话会话ID: effectiveSessionId,
        标题: conversationById.get(snapshot.conversation_id)?.title || "",
        时间戳: context.time.display,
        对话归档日期: context.time.date,
        课时: context.lesson,
        HTML_SHA256: hash,
        关联方式: relation,
        关联置信度: confidence,
        文件路径: path,
      });
    });
  }

  for (const task of data.tasks) {
    if (task.task_id === "survey") continue;
    const timestamp = task.updated_at || task.created_at;
    const context = exportContext(task.user_id, timestamp);
    const baseName = `构思任务_${safeSegment(task.task_id)}_${context.time.file}_id-${task.id}`;
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
    const jsonPath = `${context.base}/${baseName}.json`;
    addIndexedFile(jsonPath, JSON.stringify(taskPayload, null, 2), fileMeta("阶段作品平台", "构思任务数据", "student_tasks", task.id, task.user_id, timestamp, "", "student_tasks.user_id = users.id"));
    const image = decodeDataUrl(task.design_image);
    if (image) {
      const imagePath = `${context.base}/${baseName}_设计图.${image.extension}`;
      addIndexedFile(imagePath, image.bytes, fileMeta("阶段作品平台", "阶段设计图", "student_tasks", task.id, task.user_id, timestamp, "", "student_tasks.user_id = users.id"));
    }
  }

  const sharedItemsByHash = new Map<string, Row[]>();
  const sharedItemsByNormalizedHash = new Map<string, Row[]>();
  for (const item of data.sharedItems || []) {
    if (!item.html_code) continue;
    const exactKey = `${item.user_id}:${hashContent(item.html_code)}`;
    const normalizedKey = `${item.user_id}:${normalizedHtmlHash(item.html_code)}`;
    sharedItemsByHash.set(exactKey, [...(sharedItemsByHash.get(exactKey) || []), item]);
    sharedItemsByNormalizedHash.set(normalizedKey, [...(sharedItemsByNormalizedHash.get(normalizedKey) || []), item]);
  }
  const codeMessageSessionsByHash = new Map<string, ExportSession[]>();
  const codeMessageSessionsByNormalizedHash = new Map<string, ExportSession[]>();
  for (const session of sessionBuild.sessions) {
    for (const message of session.messages) {
      const html = extractHtmlFromMessage(message.content);
      if (!html) continue;
      const exactKey = `${message.user_id}:${hashContent(html)}`;
      const normalizedKey = `${message.user_id}:${normalizedHtmlHash(html)}`;
      codeMessageSessionsByHash.set(exactKey, [...(codeMessageSessionsByHash.get(exactKey) || []), session]);
      codeMessageSessionsByNormalizedHash.set(normalizedKey, [...(codeMessageSessionsByNormalizedHash.get(normalizedKey) || []), session]);
    }
  }
  const conversationIdBySessionKey = new Map<string, string>();
  for (const [conversationId, link] of conversationSessionLinks) {
    if (!conversationIdBySessionKey.has(link.session.key)) conversationIdBySessionKey.set(link.session.key, conversationId);
  }

  // 最终作品：优先使用shared_items中的conversation_id，其次使用HTML、消息代码和时间邻近关系。
  for (const project of data.projects) {
    const timestamp = project.updated_at || project.created_at;
    const hash = hashContent(project.html_code || "");
    const hashKey = `${project.user_id}:${hash}`;
    const normalizedHashKey = `${project.user_id}:${normalizedHtmlHash(project.html_code)}`;
    let linkedConversationId = "";
    let linkedSession: ExportSession | undefined;
    let relation = "";
    let confidence: "高" | "中" | "低" | "需人工核验" = "需人工核验";

    const sharedItem = (sharedItemsByHash.get(hashKey) || []).find((item) => item.conversation_id && conversationSessionLinks.has(item.conversation_id));
    if (sharedItem) {
      linkedConversationId = sharedItem.conversation_id;
      linkedSession = conversationSessionLinks.get(linkedConversationId)?.session;
      relation = "projects与shared_items属于同一学生且HTML_SHA256一致；shared_items.conversation_id精确关联";
      confidence = "高";
    }

    const exactConversation = (conversationHashCandidates.get(hashKey) || []).find((conversation) => conversationSessionLinks.has(conversation.id));
    const exactSnapshot = (snapshotHashCandidates.get(hashKey) || []).find((snapshot) => snapshot.conversation_id && conversationSessionLinks.has(snapshot.conversation_id));
    if (!linkedSession && (exactConversation || exactSnapshot)) {
      linkedConversationId = exactConversation?.id || exactSnapshot?.conversation_id || "";
      linkedSession = conversationSessionLinks.get(linkedConversationId)?.session;
      relation = `同一学生且HTML_SHA256完全一致（${exactConversation ? "conversations" : "game_snapshots"}）`;
      confidence = "高";
    }

    const normalizedSharedItem = (sharedItemsByNormalizedHash.get(normalizedHashKey) || []).find((item) => item.conversation_id && conversationSessionLinks.has(item.conversation_id));
    const normalizedConversation = (conversationNormalizedHashCandidates.get(normalizedHashKey) || []).find((conversation) => conversationSessionLinks.has(conversation.id));
    const normalizedSnapshot = (snapshotNormalizedHashCandidates.get(normalizedHashKey) || []).find((snapshot) => snapshot.conversation_id && conversationSessionLinks.has(snapshot.conversation_id));
    if (!linkedSession && (normalizedSharedItem || normalizedConversation || normalizedSnapshot)) {
      linkedConversationId = normalizedSharedItem?.conversation_id || normalizedConversation?.id || normalizedSnapshot?.conversation_id || "";
      linkedSession = conversationSessionLinks.get(linkedConversationId)?.session;
      relation = "同一学生且标准化HTML一致（仅忽略BOM、换行和标签间空白）";
      confidence = "中";
    }

    const codeSession = (codeMessageSessionsByHash.get(hashKey) || [])[0]
      || (codeMessageSessionsByNormalizedHash.get(normalizedHashKey) || [])[0];
    if (!linkedSession && codeSession) {
      linkedSession = codeSession;
      linkedConversationId = conversationIdBySessionKey.get(codeSession.key) || "";
      relation = "最终作品HTML与AI消息中的游戏代码一致";
      confidence = "高";
    }

    if (!linkedSession) {
      const userSessions = sessionsByUser.get(project.user_id) || [];
      const projectTime = new Date(project.created_at || timestamp).getTime();
      const sameDaySessions = userSessions.filter((session) => timestampParts(session.firstAt).date === timestampParts(project.created_at || timestamp).date);
      const candidates = sameDaySessions.length ? sameDaySessions : userSessions;
      linkedSession = [...candidates].sort((a, b) => Math.abs(new Date(a.lastAt).getTime() - projectTime) - Math.abs(new Date(b.lastAt).getTime() - projectTime))[0];
      if (linkedSession) {
        linkedConversationId = conversationIdBySessionKey.get(linkedSession.key) || "";
        relation = sameDaySessions.length
          ? "同一学生、同一日期、与作品创建时间最近的对话"
          : "同一学生、与作品创建时间最近的历史对话；缺少直接关联字段";
        confidence = sameDaySessions.length ? "中" : "低";
      }
    }

    const archiveTimestamp = linkedSession ? closestMessageTime(linkedSession, project.created_at || timestamp) : timestamp;
    const context = exportContext(project.user_id, archiveTimestamp);
    const effectiveSessionId = linkedSession?.sessionId || "未找到对话";
    const sessionFolder = `session_${safeSegment(effectiveSessionId, "no_session", 40)}`;
    const exceptionBase = `99_异常_有作品无对话/${context.classFolder}/${context.srlFolder}/${context.studentFolder}`;
    const base = linkedSession ? context.base : exceptionBase;
    const path = `${base}/对应最终游戏_${sessionFolder}_project_${safeSegment(project.id)}_${timestampParts(timestamp).file}_${safeSegment(project.game_title, "未命名游戏")}.html`;
    addIndexedFile(path, project.html_code || "", fileMeta("最终作品平台", "最终游戏作品", "projects", project.id, project.user_id, timestamp, effectiveSessionId, relation || "未找到可对应的学生-AI对话", confidence, linkedSession?.originalSessionId || "", archiveTimestamp));
    if (!linkedSession) integrityIssues.push({
      异常类型: "有最终作品但未找到对话",
      来源表: "projects",
      记录ID: project.id,
      用户UUID: project.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      作品时间: timestampParts(timestamp).display,
      文件路径: path,
      建议: "核查Supabase messages、shared_items和历史备份",
    });
    artifactIndex.push({
      作品阶段: "最终作品",
      来源表: "projects",
      作品ID: project.id,
      用户UUID: project.user_id,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      数据库会话ID: linkedConversationId,
      对应对话会话ID: effectiveSessionId,
      标题: project.game_title || "",
      是否发布: project.is_published ?? "",
      时间戳: timestampParts(timestamp).display,
      对话归档日期: context.time.date,
      课时: context.lesson,
      HTML_SHA256: hash,
      关联方式: relation,
      关联置信度: confidence,
      文件路径: path,
    });
  }

  // 小组协作对话：按组别和活动日期拆分，并复制到当天有发言的每位学生目录。
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
    const groupFile = `${safeSegment(first.group_id)}_${safeSegment(group.name, "未命名小组")}`;
    const baseDetailRows = rows.map((message) => {
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
      };
    });
    const participantPaths: string[] = [];
    const participantIds = [...new Set(rows.map((message) => String(message.user_id)))];
    for (const participantId of participantIds) {
      const participantFirst = rows.find((message) => String(message.user_id) === participantId) || first;
      const context = exportContext(participantId, participantFirst.created_at);
      const txtPath = `${context.base}/小组对话_${groupFile}.txt`;
      const csvPath = `${context.base}/小组对话_${groupFile}_消息明细.csv`;
      const detailRows = baseDetailRows.map((row) => ({ ...row, 对话文件路径: txtPath }));
      const txt = [
        `组别ID：${first.group_id}`,
        `组别名称：${group.name || ""}`,
        `所属学生：${context.student.student_id || ""} ${context.student.name || ""}`,
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
      const relation = "group_id + 活动日期；复制到当日有发言的学生目录";
      addIndexedFile(txtPath, txt, fileMeta("小组协作平台", "小组完整对话", "group_messages", `${first.group_id}:${context.time.date}`, participantId, participantFirst.created_at, "", relation));
      addIndexedFile(csvPath, toCsv(detailRows), fileMeta("小组协作平台", "小组消息明细CSV", "group_messages", `${first.group_id}:${context.time.date}`, participantId, participantFirst.created_at, "", relation));
      participantPaths.push(txtPath);
    }
    groupMessageIndex.push(...baseDetailRows.map((row) => ({ ...row, 对话文件路径: participantPaths.join(" | ") })));
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
    const path = `${context.base}/平台行为事件.csv`;
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
  const sessionRows: Row[] = [];
  for (const session of sessionBuild.sessions) {
    const rows = session.messages;
    const linkedConversations = [...conversationSessionLinks.entries()]
      .filter(([, link]) => link.session.key === session.key)
      .map(([conversationId]) => conversationById.get(conversationId))
      .filter((conversation): conversation is Row => Boolean(conversation));
    const linkedArtifacts = artifactIndex.filter((artifact) => artifact.用户UUID === session.userId && artifact.对应对话会话ID === session.sessionId);
    const stageArtifacts = linkedArtifacts.filter((artifact) => artifact.来源表 !== "projects");
    const finalArtifacts = linkedArtifacts.filter((artifact) => artifact.来源表 === "projects");
    const context = exportContext(session.userId, session.firstAt);
    const relationPath = `${context.base}/会话_${safeSegment(session.sessionId, "no_session", 40)}_对话与游戏对应关系.csv`;
    const relationRows = [
      ...(sessionFilePaths.get(session.key) || []).map((path) => ({
        会话ID: session.sessionId,
        文件类别: path.endsWith(".txt") ? "完整对话TXT" : path.includes("对话配对") ? "学生-AI对话配对CSV" : "逐条消息CSV",
        作品阶段: "",
        记录ID: "",
        数据库会话ID: session.originalSessionId,
        关联方式: session.relation,
        关联置信度: session.confidence,
        文件路径: path,
      })),
      ...linkedArtifacts.map((artifact) => ({
        会话ID: session.sessionId,
        文件类别: "游戏HTML",
        作品阶段: artifact.作品阶段,
        记录ID: artifact.作品ID,
        数据库会话ID: artifact.数据库会话ID || "",
        关联方式: artifact.关联方式,
        关联置信度: artifact.关联置信度,
        文件路径: artifact.文件路径,
      })),
    ];
    addIndexedFile(relationPath, toCsv(relationRows), fileMeta("关联索引", "会话与游戏一一对应表", "messages + conversations + game_snapshots + projects", session.sessionId, session.userId, session.firstAt, session.sessionId, session.relation, session.confidence, session.originalSessionId));
    const dialoguePaths = [...(sessionFilePaths.get(session.key) || []), relationPath];
    sessionFilePaths.set(session.key, dialoguePaths);
    sessionRows.push({
      用户UUID: session.userId,
      学生ID: context.student.student_id || "",
      姓名: context.student.name || "",
      年级: context.student.grade ?? "",
      班级: context.student.class_num ?? context.student.class_name ?? "",
      组别ID: context.groupIds,
      组别名称: context.groupNames,
      会话ID: session.sessionId,
      原始会话ID: session.originalSessionId,
      会话识别方式: session.relation,
      会话识别置信度: session.confidence,
      数据库会话ID: linkedConversations.map((conversation) => conversation.id).join(" | "),
      会话标题: linkedConversations.map((conversation) => conversation.title || "").filter(Boolean).join(" | "),
      首条消息时间: timestampParts(session.firstAt).display,
      末条消息时间: timestampParts(session.lastAt).display,
      活动日期列表: [...new Set(rows.map((row) => timestampParts(row.created_at).date))].join(" | "),
      消息数: rows.length,
      学生消息数: rows.filter((row) => row.role === "user").length,
      AI消息数: rows.filter((row) => row.role === "assistant").length,
      阶段作品数: stageArtifacts.length,
      最终作品数: finalArtifacts.length,
      对话与配对表路径: dialoguePaths.join(" | "),
      阶段作品文件路径: stageArtifacts.map((artifact) => artifact.文件路径).join(" | "),
      最终作品文件路径: finalArtifacts.map((artifact) => artifact.文件路径).join(" | "),
    });
  }

  // 学生级总索引将全部会话文件与全部作品集中列出，便于逐人核对一一对应关系。
  for (const [userId, userSessions] of sessionsByUser) {
    if (!userSessions.length) continue;
    const firstAt = [...userSessions].sort((a, b) => String(a.firstAt).localeCompare(String(b.firstAt)))[0].firstAt;
    const context = exportContext(userId, firstAt);
    const relationPath = `${studentRoot(context)}/00_该学生对话与作品总索引.csv`;
    const summaryFiles = studentSummaryPaths.get(userId) || [];
    const relationRows = [
      ...summaryFiles.map((path) => ({
        会话ID: "全部会话",
        文件类别: path.endsWith(".txt") ? "学生全部对话TXT" : path.includes("_配对.csv") ? "学生全部对话配对CSV" : "学生全部消息CSV",
        作品阶段: "",
        记录ID: "",
        数据库会话ID: "",
        关联方式: "按messages.user_id汇总全部日期与会话",
        关联置信度: "高",
        文件路径: path,
      })),
      ...userSessions.flatMap((session) => (sessionFilePaths.get(session.key) || []).map((path) => ({
        会话ID: session.sessionId,
        文件类别: path.endsWith(".txt") ? "会话完整对话TXT" : path.includes("对话配对") ? "会话对话配对CSV" : path.includes("对应关系") ? "会话与游戏对应关系CSV" : "会话逐条消息CSV",
        作品阶段: "",
        记录ID: "",
        数据库会话ID: session.originalSessionId,
        关联方式: session.relation,
        关联置信度: session.confidence,
        文件路径: path,
      }))),
      ...artifactIndex.filter((artifact) => artifact.用户UUID === userId).map((artifact) => ({
        会话ID: artifact.对应对话会话ID,
        文件类别: "游戏HTML",
        作品阶段: artifact.作品阶段,
        记录ID: artifact.作品ID,
        数据库会话ID: artifact.数据库会话ID || "",
        关联方式: artifact.关联方式,
        关联置信度: artifact.关联置信度,
        文件路径: artifact.文件路径,
      })),
    ];
    addIndexedFile(relationPath, toCsv(relationRows), fileMeta(
      "关联索引",
      "学生全部对话与作品总索引",
      "messages + conversations + game_snapshots + projects",
      userId,
      userId,
      firstAt,
      "全部会话",
      "按用户汇总全部会话及作品关联",
      "高",
    ));
    studentSummaryPaths.set(userId, [...summaryFiles, relationPath]);
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
    ["shared_items", (data.sharedItems || []).length],
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
  zip.file("00_索引/数据完整性异常.csv", toCsv(integrityIssues));
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
    `历史空session_id消息数：${data.messages.filter((message) => !message.session_id).length}`,
    `重建历史对话会话数：${sessionBuild.sessions.filter((session) => !session.originalSessionId).length}`,
    `完整性异常数：${integrityIssues.length}`,
    "",
    "目录说明：",
    "1. 00_索引：学生、组别、课时、会话、消息、作品和文件之间的完整对应关系；数据完整性异常.csv列出无法可靠恢复的数据。",
    "2. 00_汇总数据：前测、互评、反思和分类评估。",
    "3. 01_按班级：班级 → SRL组别 → 学生。每个学生目录首先提供00_该学生全部AI对话.txt、全部对话配对CSV、全部消息CSV及对话与作品总索引；各日期文件夹保留会话级对话、消息、对应游戏和对应关系表。",
    "4. 99_异常_有作品无对话：只有在messages中确实找不到该学生任何可关联对话时才进入此目录，不会伪造对话。",
    "",
    "课时推导规则：",
    "数据库当前没有显式 lesson_id。导出程序按同一班级发生数据活动的日期升序自动编号为第01课时、第02课时……。",
    "因此课时是可复核的日期级推导值，不代表同一天内的具体节次。课时信息只保留在索引及文件内容中，不再创建课时子文件夹。",
    "",
    "平台划分规则：",
    "AI对话平台 = messages；小组协作平台 = group_messages；阶段作品平台 = conversations 当前HTML、game_snapshots 与 student_tasks；最终作品平台 = projects；平台行为 = interaction_events 与 game_events。平台类型记录在文件名和索引中，不再创建平台子文件夹。",
    "",
    "会话重建规则：",
    "messages.session_id存在时使用原值；历史session_id为空的消息，按同一学生相邻消息不超过30分钟重建为legacy会话。原始ID、重建规则和置信度均写入索引。",
    "",
    "作品关联规则（按优先级）：",
    "shared_items.conversation_id精确关联 → 同一学生HTML SHA256一致 → 标准化HTML一致 → AI消息代码一致 → 同一学生同日时间最近 → 同一学生历史时间最近。每个作品只选择一个对话，关联方式和置信度写入作品索引。",
    "",
    "完整性说明：",
    "对话正文和HTML作品均完整导出，不截断。对话配对CSV将连续学生发言与随后AI回复整理为一轮，未回复发言明确标记。文件名包含记录ID或会话ID以避免同名覆盖。CSV采用UTF-8 BOM。",
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
    message_count_matches: messageIndex.length === data.messages.length,
    students_with_messages: sessionsByUser.size,
    students_with_complete_dialogue_files: studentsWithCompleteDialogueFiles,
    student_complete_dialogue_message_count_matches: completeDialogueMessageKeys.size === data.messages.length,
    derived_legacy_session_count: sessionBuild.sessions.filter((session) => !session.originalSessionId).length,
    integrity_issue_count: integrityIssues.length,
    games_without_dialogue_count: artifactIndex.filter((artifact) => artifact.对应对话会话ID === "未找到对话").length,
    low_confidence_game_link_count: artifactIndex.filter((artifact) => artifact.关联置信度 === "低").length,
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
      sharedItems: (data.sharedItems || []).length,
      indexedFiles: fileIndex.length,
      sessions: sessionRows.length,
    },
    warnings,
  };
}

export function researchExportFilename(date = new Date()): string {
  return `AI游戏课堂_研究数据包_${timestampParts(date.toISOString()).date}.zip`;
}
