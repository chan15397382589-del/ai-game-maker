import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildResearchExport, researchExportFilename } from "../src/lib/admin-export.ts";

const html = "<!doctype html><html><body><canvas></canvas></body></html>";
const longStudentText = "超长学生发言😊".repeat(4500);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const data = {
  students: [{
    id: "u1",
    student_id: "S001",
    name: "测试学生",
    grade: 3,
    class_num: 4,
    gender: "女",
    srl_condition: "control",
    created_at: "2026-05-20T01:00:00Z",
  }],
  messages: [
    { id: 1, user_id: "u1", session_id: "c1", role: "user", content: "我要做游戏😊", created_at: "2026-05-21T07:00:00Z" },
    { id: 2, user_id: "u1", session_id: "c1", role: "assistant", content: `第一天回复\n${"长文本".repeat(300)}`, created_at: "2026-05-21T07:01:00Z" },
    { id: 3, user_id: "u1", session_id: "c2", role: "user", content: "第二天继续修改🎮", created_at: "2026-05-22T07:00:00Z" },
    { id: 4, user_id: "u1", session_id: "c2", role: "assistant", content: "第二天完整回复🍎", created_at: "2026-05-22T07:01:00Z" },
    { id: 5, user_id: "u1", session_id: "c2", role: "user", content: longStudentText, created_at: "2026-05-22T07:02:00Z" },
  ],
  conversations: [
    { id: "c1", user_id: "u1", title: "第一版", html_code: html, created_at: "2026-05-21T07:00:00Z", updated_at: "2026-05-21T07:02:00Z", reflection: null },
    { id: "c2", user_id: "u1", title: "第二版", html_code: html, created_at: "2026-05-22T07:00:00Z", updated_at: "2026-05-22T07:02:00Z", reflection: null },
  ],
  projects: [],
  sharedItems: [],
  snapshots: [],
  tasks: [{ id: 7, user_id: "u1", task_id: "1-1", design_image: null, game_name: "测试", created_at: "2026-05-21T06:00:00Z", updated_at: "2026-05-21T06:30:00Z" }],
  groups: [{ id: "g1", name: "第一组", grade: 3, class_num: 4, created_at: "2026-05-20T00:00:00Z" }],
  groupMembers: [{ group_id: "g1", user_id: "u1", joined_at: "2026-05-20T00:00:00Z" }],
  groupMessages: [],
  interactionEvents: [],
  gameEvents: [],
  peerReviews: [],
  classifications: [],
};

const result = await buildResearchExport(data, [], new Date("2026-05-23T00:00:00Z"));
const generatedChunks = [];
const zipNodeStream = result.zip.generateNodeStream({
  type: "nodebuffer",
  streamFiles: true,
  compression: "DEFLATE",
  compressionOptions: { level: 3 },
});
const zipWebReader = Readable.toWeb(zipNodeStream).getReader();
for (;;) {
  const { done, value } = await zipWebReader.read();
  if (done) break;
  generatedChunks.push(Buffer.from(value));
}
const generated = Buffer.concat(generatedChunks);
const zip = await JSZip.loadAsync(generated);
const files = Object.keys(zip.files).filter((path) => !zip.files[path].dir);
const studentRoot = "01_按班级/3年级_4班/SRL_control/S001_测试学生_u1/";
const packageWorkbookPath = "00_汇总数据/学生研究数据总表.xlsx";
const packageDialogueWorkbookPath = "00_汇总数据/学生的所有对话记录.xlsx";
const packageRelationsPath = "00_汇总数据/对话与作品对应索引.csv";
const packageMessagesPath = "00_汇总数据/全部学生消息.csv";

for (const path of [packageWorkbookPath, packageDialogueWorkbookPath, packageRelationsPath, packageMessagesPath, "导出格式版本.txt"]) {
  assert(files.includes(path), `研究数据包根级汇总缺少新版表格：${path}`);
}
assert.equal(
  researchExportFilename(new Date("2026-05-23T01:02:03Z")),
  "AI游戏课堂_研究数据包_v2.0_2026-05-23_09-02-03.zip",
  "文件名必须包含格式版本和精确时间，避免误开同日旧数据包",
);

const fullTxtPath = `${studentRoot}00_该学生全部AI对话.txt`;
const fullPairPath = `${studentRoot}00_该学生全部AI对话_配对.csv`;
const fullMessagesPath = `${studentRoot}00_该学生全部消息.csv`;
const fullRelationsPath = `${studentRoot}00_对话与作品对应索引.csv`;
const reviewWorkbookPath = `${studentRoot}00_学生的所有对话记录.xlsx`;
const researchWorkbookPath = `${studentRoot}00_学生研究数据总表.xlsx`;

for (const path of [fullTxtPath, fullPairPath, fullMessagesPath, fullRelationsPath, reviewWorkbookPath, researchWorkbookPath]) {
  assert(files.includes(path), `缺少学生级完整汇总文件：${path}`);
}

const fullTxt = await zip.file(fullTxtPath).async("string");
for (const id of [1, 2, 3, 4, 5]) {
  assert.equal([...fullTxt.matchAll(new RegExp(`message_id=${id}\\]`, "g"))].length, 1, `消息${id}应在学生完整TXT中且仅出现一次`);
}
assert(fullTxt.includes("第一天回复"));
assert(fullTxt.includes("第二天完整回复🍎"));
assert(fullTxt.includes("我要做游戏😊"));
assert(fullTxt.includes("第二天继续修改🎮"));
assert(fullTxt.includes("长文本".repeat(300)), "完整汇总不得截断长回复");
assert(fullTxt.includes(longStudentText), "完整TXT不得截断超过Excel单元格上限的学生发言");

const fullMessages = await zip.file(fullMessagesPath).async("string");
assert(fullMessages.includes("第二天完整回复🍎"), "ZIP往返后必须保留非BMP字符");

const reviewWorkbookBuffer = await zip.file(reviewWorkbookPath).async("nodebuffer");
const reviewWorkbookZip = await JSZip.loadAsync(reviewWorkbookBuffer);
const workbookStringXmlPath = reviewWorkbookZip.file("xl/sharedStrings.xml")
  ? "xl/sharedStrings.xml"
  : "xl/worksheets/sheet2.xml";
const workbookStringXml = await reviewWorkbookZip.file(workbookStringXmlPath).async("nodebuffer");
assert.equal(
  workbookStringXml.indexOf(Buffer.from([0xef, 0xbf, 0xbd])),
  -1,
  "XLSX内部XML不得出现由Emoji损坏产生的U+FFFD替换字符",
);
const reviewWorkbook = new ExcelJS.Workbook();
await reviewWorkbook.xlsx.load(reviewWorkbookBuffer);
assert.deepEqual(reviewWorkbook.worksheets.map((sheet) => sheet.name), ["AI预编码人工检查表", "消息审计"]);

const dialogueSheet = reviewWorkbook.getWorksheet("AI预编码人工检查表");
assert.deepEqual(dialogueSheet.getRow(1).values.slice(1), [
  "学生ID", "姓名", "班级", "SRL组别", "上课日期", "历时轮次序号",
  "上一轮AI回复 AI(t-1)", "当前学生发言 Student(t)", "当前AI回复 AI(t)", "内容分段",
]);
assert.equal(dialogueSheet.getCell("A1").fill.fgColor.argb, "FFD9EAF7");
assert.equal(dialogueSheet.views[0].state, "frozen");
assert.equal(dialogueSheet.getCell("C2").value, "三年级4班");
assert.equal(dialogueSheet.getCell("G2").value, "（首轮，无上一轮AI回复）");
assert.equal(dialogueSheet.getCell("H2").value, "我要做游戏😊", "主表正文不得混入消息ID或时间戳");
assert(String(dialogueSheet.getCell("G3").value).includes("第一天回复"));
const longDialogueRows = [];
dialogueSheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1 && row.getCell(6).value === 3) longDialogueRows.push(row);
});
assert(longDialogueRows.length > 1, "超过Excel单元格上限的轮次必须拆分到连续行");
assert.equal(longDialogueRows.map((row) => String(row.getCell(8).value || "")).join(""), longStudentText);
assert.equal(longDialogueRows[0].getCell(10).value, `1/${longDialogueRows.length}`);

const auditSheet = reviewWorkbook.getWorksheet("消息审计");
const longAuditRows = [];
auditSheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1 && String(row.getCell(2).value) === "5") longAuditRows.push(row);
});
assert(longAuditRows.length > 1, "消息审计表必须分段保存超长原文");
const reassembledLongText = longAuditRows.map((row) => String(row.getCell(6).value || "")).join("");
if (reassembledLongText !== longStudentText) {
  const firstDifference = [...Array(Math.max(reassembledLongText.length, longStudentText.length)).keys()]
    .find((index) => reassembledLongText[index] !== longStudentText[index]);
  assert.fail([
    "消息审计表超长原文分段重组不一致",
    `expectedLength=${longStudentText.length}`,
    `actualLength=${reassembledLongText.length}`,
    `expectedSHA256=${sha256(longStudentText)}`,
    `actualSHA256=${sha256(reassembledLongText)}`,
    `xlsxXml=${workbookStringXmlPath}`,
    `xlsxReplacementBytes=${workbookStringXml.indexOf(Buffer.from([0xef, 0xbf, 0xbd]))}`,
    `segmentLengths=${longAuditRows.map((row) => String(row.getCell(6).value || "").length).join(",")}`,
    `firstDifference=${firstDifference}`,
    `expectedCodeUnit=${longStudentText.charCodeAt(firstDifference)}`,
    `actualCodeUnit=${reassembledLongText.charCodeAt(firstDifference)}`,
  ].join("; "));
}
assert(longAuditRows.every((row) => String(row.getCell(6).value || "").length <= 8000));
assert(longAuditRows.every((row) => row.getCell(7).value === sha256(longStudentText)));

const researchWorkbookBuffer = await zip.file(researchWorkbookPath).async("nodebuffer");
const researchWorkbook = new ExcelJS.Workbook();
await researchWorkbook.xlsx.load(researchWorkbookBuffer);
assert.deepEqual(researchWorkbook.worksheets.map((sheet) => sheet.name), [
  "学生研究概览",
  "AI预编码人工检查表",
  "全部消息",
  "对话与作品索引",
]);

const overviewSheet = researchWorkbook.getWorksheet("学生研究概览");
assert.deepEqual(overviewSheet.getRow(1).values.slice(1), [
  "学生ID", "姓名", "班级", "SRL组别", "用户UUID", "小组名称", "活动日期数", "会话数",
  "对话轮次数", "消息总数", "学生消息数", "AI消息数", "原始会话ID为空消息数",
  "阶段作品数", "最终作品数", "未关联对话作品数", "低置信度作品关联数", "数据检查结果",
]);
assert.deepEqual(overviewSheet.getRow(2).values.slice(1, 19), [
  "S001", "测试学生", "三年级4班", "control", "u1", "第一组", 2, 2, 3, 5, 3, 2, 0, 2, 0, 0, 0, "正常",
]);
assert.equal(overviewSheet.getCell("A1").fill.fgColor.argb, "FFD9EAF7");
assert.equal(overviewSheet.views[0].state, "frozen");

const researchDialogueSheet = researchWorkbook.getWorksheet("AI预编码人工检查表");
assert.equal(researchDialogueSheet.getCell("H2").value, "我要做游戏😊");
const researchMessageSheet = researchWorkbook.getWorksheet("全部消息");
const researchLongRows = [];
researchMessageSheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1 && String(row.getCell(2).value) === "5") researchLongRows.push(row);
});
assert.equal(researchLongRows.map((row) => String(row.getCell(6).value || "")).join(""), longStudentText);

const relationCsv = await zip.file(fullRelationsPath).async("string");
assert(relationCsv.includes(reviewWorkbookPath));
assert(relationCsv.includes(researchWorkbookPath));
assert(relationCsv.includes(fullRelationsPath));
const relationCsvRows = relationCsv.replace(/^\uFEFF/, "").split("\r\n");
const relationSheet = researchWorkbook.getWorksheet("对话与作品索引");
assert.equal(relationSheet.rowCount, relationCsvRows.length, "工作簿关系索引与CSV记录数应一致");
assert.deepEqual(relationSheet.getRow(1).values.slice(1), [
  "会话ID", "文件类别", "作品阶段", "记录ID", "数据库会话ID", "关联方式", "关联置信度", "文件路径",
]);
assert.equal(relationSheet.getCell("A1").fill.fgColor.argb, "FFD9EAF7");

const packageResearchWorkbook = new ExcelJS.Workbook();
await packageResearchWorkbook.xlsx.load(await zip.file(packageWorkbookPath).async("nodebuffer"));
assert.deepEqual(packageResearchWorkbook.worksheets.map((sheet) => sheet.name), [
  "学生研究概览",
  "AI预编码人工检查表",
  "全部消息",
  "对话与作品索引",
]);
assert.equal(packageResearchWorkbook.getWorksheet("学生研究概览").getCell("A2").value, "S001");
assert.equal(packageResearchWorkbook.getWorksheet("全部消息").getCell("F2").value, "我要做游戏😊");

const packageDialogueWorkbook = new ExcelJS.Workbook();
await packageDialogueWorkbook.xlsx.load(await zip.file(packageDialogueWorkbookPath).async("nodebuffer"));
assert.deepEqual(packageDialogueWorkbook.worksheets.map((sheet) => sheet.name), ["AI预编码人工检查表", "消息审计"]);
assert.equal(packageDialogueWorkbook.getWorksheet("AI预编码人工检查表").getCell("H2").value, "我要做游戏😊");
assert((await zip.file(packageRelationsPath).async("string")).includes("学生研究数据总表XLSX"));
assert((await zip.file(packageMessagesPath).async("string")).includes(longStudentText));
assert((await zip.file("导出格式版本.txt").async("string")).includes("导出格式版本：2.0"));

const integrity = JSON.parse(await zip.file("00_索引/数据完整性汇总.json").async("string"));
assert.equal(integrity.export_schema_version, "2.0");
assert.equal(integrity.students_with_messages, 1);
assert.equal(integrity.students_with_complete_dialogue_files, 1);
assert.equal(integrity.student_complete_dialogue_message_count_matches, true);

console.log(JSON.stringify({ ok: true, files: files.length, zipBytes: generated.byteLength }));
