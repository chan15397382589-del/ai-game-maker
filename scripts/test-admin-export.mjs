import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildResearchExport } from "../src/lib/admin-export.ts";

const html = "<!doctype html><html><body><canvas></canvas></body></html>";
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
const generated = await result.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
const zip = await JSZip.loadAsync(generated);
const files = Object.keys(zip.files).filter((path) => !zip.files[path].dir);
const studentRoot = "01_按班级/3年级_4班/SRL_control/S001_测试学生_u1/";

const fullTxtPath = `${studentRoot}00_该学生全部AI对话.txt`;
const fullPairPath = `${studentRoot}00_该学生全部AI对话_配对.csv`;
const fullMessagesPath = `${studentRoot}00_该学生全部消息.csv`;
const fullRelationsPath = `${studentRoot}00_该学生对话与作品总索引.csv`;

for (const path of [fullTxtPath, fullPairPath, fullMessagesPath, fullRelationsPath]) {
  assert(files.includes(path), `缺少学生级完整汇总文件：${path}`);
}

const fullTxt = await zip.file(fullTxtPath).async("string");
for (const id of [1, 2, 3, 4]) {
  assert.equal([...fullTxt.matchAll(new RegExp(`message_id=${id}\\]`, "g"))].length, 1, `消息${id}应在学生完整TXT中且仅出现一次`);
}
assert(fullTxt.includes("第一天回复"));
assert(fullTxt.includes("第二天完整回复🍎"));
assert(fullTxt.includes("我要做游戏😊"));
assert(fullTxt.includes("第二天继续修改🎮"));
assert(fullTxt.includes("长文本".repeat(300)), "完整汇总不得截断长回复");

const fullMessages = await zip.file(fullMessagesPath).async("string");
assert(fullMessages.includes("第二天完整回复🍎"), "ZIP往返后必须保留非BMP字符");

const integrity = JSON.parse(await zip.file("00_索引/数据完整性汇总.json").async("string"));
assert.equal(integrity.students_with_messages, 1);
assert.equal(integrity.students_with_complete_dialogue_files, 1);
assert.equal(integrity.student_complete_dialogue_message_count_matches, true);

console.log(JSON.stringify({ ok: true, files: files.length, zipBytes: generated.byteLength }));
