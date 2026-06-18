// Load test: simulate 40 concurrent students taking exam
const CONCURRENT_USERS = 40;
const SUPABASE_URL = "https://fyocfhjjiazjgdxdaxur.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5b2NmaGpqaWF6amdkeGRheHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzA2MTYsImV4cCI6MjA5NDI0NjYxNn0.5aA5vChTVjxIil2X0qWuNFsazYBKsdNlMJC8tm9pun0";
const SITE_URL = "https://www.vibeclassroom.asia";

const STUDENT_IDS = [
  "3220105", "3220037", "3220036", "11", "3220053", "3220052", "3220055", "3220057",
  "3220058", "3220054", "3220059", "3219932", "3219934", "3219975", "3219976",
  "3219974", "3219977", "3219980", "3219984", "3219990", "3220002", "3220003",
  "3220004", "3220005", "3220006", "3220007", "3220008", "3220009", "3220010",
  "3220011", "3220012", "3220013", "3220014", "3220015", "3220016", "3220017",
  "3220018", "3220019", "3220020", "3220021"
];

async function loginAsStudent(studentId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
      body: JSON.stringify({ email: `${studentId}@ai-game.student`, password: "123456" }),
    });
    const data = await res.json();
    return data.access_token || null;
  } catch { return null; }
}

async function testExam(token, studentId) {
  const start = Date.now();
  try {
    // 1. Fetch questions
    const qRes = await fetch(`${SITE_URL}/api/student/exam`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!qRes.ok) return { status: "FETCH_FAILED", error: `HTTP ${qRes.status}`, time: Date.now() - start };
    const qData = await qRes.json();
    const questions = qData.questions || [];
    if (questions.length === 0) return { status: "NO_QUESTIONS", time: Date.now() - start };

    // 2. Submit answers for all questions
    const answers = ["A", "B", "C", "D"];
    let correct = 0;
    for (const q of questions) {
      const ans = answers[Math.floor(Math.random() * 4)];
      const aRes = await fetch(`${SITE_URL}/api/student/exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question_id: q.id, selected_answer: ans }),
      });
      if (aRes.ok) {
        const aData = await aRes.json();
        if (aData.is_correct) correct++;
      }
    }

    return { status: "OK", questions: questions.length, answered: questions.length, score: correct, time: Date.now() - start };
  } catch (err) {
    return { status: "ERROR", error: err.message, time: Date.now() - start };
  }
}

async function testUser(index) {
  const studentId = STUDENT_IDS[index % STUDENT_IDS.length];
  const start = Date.now();

  const token = await loginAsStudent(studentId);
  if (!token) return { index, studentId, status: "LOGIN_FAILED", time: Date.now() - start };

  const result = await testExam(token, studentId);
  return { index, studentId, ...result, totalTime: Date.now() - start };
}

async function main() {
  console.log(`Testing ${CONCURRENT_USERS} concurrent exam submissions...`);
  console.log("=".repeat(60));

  const start = Date.now();
  const batchSize = 10;
  const allResults = [];

  for (let batch = 0; batch < CONCURRENT_USERS; batch += batchSize) {
    const promises = [];
    for (let i = batch; i < Math.min(batch + batchSize, CONCURRENT_USERS); i++) {
      promises.push(testUser(i));
    }
    const batchResults = await Promise.all(promises);
    allResults.push(...batchResults);
    if (batch + batchSize < CONCURRENT_USERS) await new Promise(r => setTimeout(r, 500));
  }

  const totalTime = Date.now() - start;
  const ok = allResults.filter(r => r.status === "OK");
  const noQuestions = allResults.filter(r => r.status === "NO_QUESTIONS");
  const loginFailed = allResults.filter(r => r.status === "LOGIN_FAILED");
  const errors = allResults.filter(r => r.status === "FETCH_FAILED" || r.status === "ERROR");

  console.log("\n" + "=".repeat(60));
  console.log("EXAM LOAD TEST RESULTS");
  console.log("=".repeat(60));
  console.log(`Total users: ${CONCURRENT_USERS}`);
  console.log(`Total time: ${totalTime}ms`);
  console.log(`Success: ${ok.length}`);
  console.log(`No questions: ${noQuestions.length}`);
  console.log(`Login failed: ${loginFailed.length}`);
  console.log(`Errors: ${errors.length}`);

  if (ok.length > 0) {
    const avgTime = ok.reduce((s, r) => s + r.time, 0) / ok.length;
    console.log(`\nAvg response time: ${Math.round(avgTime)}ms`);
    console.log(`Min: ${Math.min(...ok.map(r => r.time))}ms`);
    console.log(`Max: ${Math.max(...ok.map(r => r.time))}ms`);
    console.log(`Sample: ${ok[0].studentId} - ${ok[0].answered} questions, score ${ok[0].score}`);
  }

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    errors.slice(0, 3).forEach(r => console.log(`  ${r.studentId}: ${r.error}`));
  }
}

main().catch(console.error);
