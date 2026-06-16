// Load test: simulate 40 concurrent users chatting
const CONCURRENT_USERS = 40;
const SUPABASE_URL = "https://fyocfhjjiazjgdxdaxur.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5b2NmaGpqaWF6amdkeGRheHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzA2MTYsImV4cCI6MjA5NDI0NjYxNn0.5aA5vChTVjxIil2X0qWuNFsazYBKsdNlMJC8tm9pun0";
const SITE_URL = "https://www.vibeclassroom.asia";

// Real student IDs from database
const STUDENT_IDS = [
  "3220105", "3220037", "3220036", "11", "3220053", "3220052", "3220055", "3220057",
  "3220058", "3220054", "3220059", "3219932", "3219934", "3219975", "3219976",
  "3219974", "3219977", "3219980", "3219984", "3219990", "3220002", "3220003",
  "3220004", "3220005", "3220006", "3220007", "3220008", "3220009", "3220010",
  "3220011", "3220012", "3220013", "3220014", "3220015", "3220016", "3220017",
  "3220018", "3220019", "3220020", "3220021"
];

async function loginAsStudent(studentId, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
        body: JSON.stringify({ email: `${studentId}@ai-game.student`, password: "123456" }),
      });
      const data = await res.json();
      if (data.access_token) return data.access_token;
      // If rate limited, wait and retry
      if (data.msg && data.msg.includes("rate")) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return null;
}

async function sendChatMessage(token, message) {
  const res = await fetch(`${SITE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages: [{ role: "user", content: message }] }),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };

  // Read SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let chunks = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const d = JSON.parse(line.slice(6));
          if (d.content) { content += d.content; chunks++; }
          if (d.error) return { error: d.error };
        } catch {}
      }
    }
  }

  return { content, chunks, length: content.length };
}

async function testUser(index) {
  const studentId = STUDENT_IDS[index % STUDENT_IDS.length];
  const start = Date.now();

  try {
    // Login
    const token = await loginAsStudent(studentId);
    if (!token) return { index, studentId, status: "LOGIN_FAILED", time: Date.now() - start };

    // Send chat message
    const result = await sendChatMessage(token, "你好，我想做一个弹球游戏");
    const time = Date.now() - start;

    if (result.error) return { index, studentId, status: "CHAT_ERROR", error: result.error, time };
    if (!result.content) return { index, studentId, status: "EMPTY_RESPONSE", time };

    return { index, studentId, status: "OK", length: result.length, chunks: result.chunks, time };
  } catch (err) {
    return { index, studentId, status: "EXCEPTION", error: err.message, time: Date.now() - start };
  }
}

async function main() {
  console.log(`Starting load test with ${CONCURRENT_USERS} concurrent users...`);
  console.log("=".repeat(60));

  const start = Date.now();
  const results = [];

  // Stagger logins to avoid rate limiting (batch of 10 at a time)
  const allResults = [];
  const batchSize = 10;
  for (let batch = 0; batch < CONCURRENT_USERS; batch += batchSize) {
    const promises = [];
    for (let i = batch; i < Math.min(batch + batchSize, CONCURRENT_USERS); i++) {
      promises.push(testUser(i));
    }
    const batchResults = await Promise.all(promises);
    allResults.push(...batchResults);
    // Small delay between batches
    if (batch + batchSize < CONCURRENT_USERS) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  const totalTime = Date.now() - start;

  // Analyze results
  const ok = allResults.filter(r => r.status === "OK");
  const loginFailed = allResults.filter(r => r.status === "LOGIN_FAILED");
  const chatError = allResults.filter(r => r.status === "CHAT_ERROR");
  const emptyResponse = allResults.filter(r => r.status === "EMPTY_RESPONSE");
  const exceptions = allResults.filter(r => r.status === "EXCEPTION");

  console.log("\n" + "=".repeat(60));
  console.log("LOAD TEST RESULTS");
  console.log("=".repeat(60));
  console.log(`Total users: ${CONCURRENT_USERS}`);
  console.log(`Total time: ${totalTime}ms`);
  console.log(`Success: ${ok.length}`);
  console.log(`Login failed: ${loginFailed.length}`);
  console.log(`Chat error: ${chatError.length}`);
  console.log(`Empty response: ${emptyResponse.length}`);
  console.log(`Exceptions: ${exceptions.length}`);
  console.log("");

  if (ok.length > 0) {
    const avgTime = ok.reduce((sum, r) => sum + r.time, 0) / ok.length;
    const maxTime = Math.max(...ok.map(r => r.time));
    const minTime = Math.min(...ok.map(r => r.time));
    console.log(`Response time (successful):`);
    console.log(`  Average: ${Math.round(avgTime)}ms`);
    console.log(`  Min: ${minTime}ms`);
    console.log(`  Max: ${maxTime}ms`);
  }

  if (chatError.length > 0) {
    console.log(`\nChat errors:`);
    chatError.forEach(r => console.log(`  ${r.studentId}: ${r.error}`));
  }

  if (exceptions.length > 0) {
    console.log(`\nExceptions:`);
    exceptions.forEach(r => console.log(`  ${r.studentId}: ${r.error}`));
  }

  // Save detailed results
  const fs = require("fs");
  fs.writeFileSync("load-test-results.json", JSON.stringify(allResults, null, 2));
  console.log("\nDetailed results saved to load-test-results.json");
}

main().catch(console.error);
