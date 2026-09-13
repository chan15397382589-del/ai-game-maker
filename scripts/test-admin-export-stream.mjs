import assert from "node:assert/strict";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { createResearchExportStream } from "../src/lib/admin-export.ts";

const data = {
  students: [{
    id: "u1",
    student_id: "S001",
    name: "流式导出测试学生",
    grade: 3,
    class_num: 4,
    srl_condition: "control",
    created_at: "2026-05-20T01:00:00Z",
  }],
  messages: [
    { id: 1, user_id: "u1", session_id: "c1", role: "user", content: "我要做游戏", created_at: "2026-05-21T07:00:00Z" },
    { id: 2, user_id: "u1", session_id: "c1", role: "assistant", content: "完整AI回复", created_at: "2026-05-21T07:01:00Z" },
  ],
  conversations: [{
    id: "c1",
    user_id: "u1",
    title: "第一版",
    html_code: "<!doctype html><html><body>游戏</body></html>",
    created_at: "2026-05-21T07:00:00Z",
    updated_at: "2026-05-21T07:02:00Z",
  }],
  projects: [],
  sharedItems: [],
  snapshots: [],
  tasks: [],
  groups: [],
  groupMembers: [],
  groupMessages: [],
  interactionEvents: [],
  gameEvents: [],
  peerReviews: [],
  classifications: [],
};

const { stream, completion } = createResearchExportStream(
  data,
  [],
  new Date("2026-05-23T00:00:00Z"),
);
let completed = false;
completion.then(() => { completed = true; });
const chunks = [];
const nodeStream = Readable.fromWeb(stream);
for await (const chunk of nodeStream) {
  chunks.push(Buffer.from(chunk));
  if (chunks.length === 1) {
    assert.equal(completed, false, "ZIP必须在全部工作簿完成前开始发送，避免内存累积");
  }
}
await completion;

const zip = await JSZip.loadAsync(Buffer.concat(chunks));
for (const path of [
  "导出格式版本.txt",
  "00_汇总数据/学生研究数据总表.xlsx",
  "00_汇总数据/学生的所有对话记录.xlsx",
]) {
  assert(zip.file(path), `流式ZIP缺少文件：${path}`);
}

console.log(JSON.stringify({ ok: true, zipBytes: chunks.reduce((sum, chunk) => sum + chunk.length, 0) }));
