"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";

interface Props {
  userId: string;
}

interface Question {
  id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export default function ModuleExam({ userId }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, { is_correct: boolean; correct_answer: string }>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/exam", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
        setAnswers(data.answered || {});
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleAnswer = async (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/student/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question_id: questionId, selected_answer: answer }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults((prev) => ({ ...prev, [questionId]: data }));
      }
    } catch (err) { console.error(err); } finally { setSubmitting(false); }
  };

  const handleSubmit = () => {
    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      alert(`还有 ${unanswered.length} 题未作答`);
      return;
    }
    setSubmitted(true);
  };

  const score = Object.values(results).filter((r) => r.is_correct).length;
  const total = questions.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载题目中...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <p className="text-6xl mb-4"> </p>
          <p className="text-xl font-bold text-gray-700 mb-2">暂无测试题目</p>
          <p className="text-gray-500">请等待老师上传题目</p>
        </div>
      </div>
    );
  }

  // 提交后显示成绩
  if (submitted) {
    const percentage = Math.round((score / total) * 100);
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
          <p className="text-6xl mb-4">{percentage >= 80 ? " " : percentage >= 60 ? " " : " "}</p>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">测试完成！</h2>
          <p className="text-4xl font-bold text-indigo-600 my-4">{score} / {total}</p>
          <p className="text-gray-500 mb-6">正确率 {percentage}%</p>
          <button onClick={() => setSubmitted(false)} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition">查看答案</button>
        </div>
      </div>
    );
  }

  const current = questions[currentIdx];
  const selected = answers[current.id];
  const result = results[current.id];

  return (
    <div className="max-w-3xl mx-auto py-4">
      {/* 进度条 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${((currentIdx + 1) / total) * 100}%` }} />
        </div>
        <span className="text-sm text-gray-500">{currentIdx + 1} / {total}</span>
      </div>

      {/* 题目卡片 */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-500">
          <p className="text-white font-bold">第 {currentIdx + 1} 题</p>
        </div>
        <div className="p-6">
          <p className="text-lg font-medium text-gray-800 mb-6">{current.question_text}</p>

          <div className="space-y-3">
            {["A", "B", "C", "D"].map((opt) => {
              const optText = current[`option_${opt.toLowerCase()}` as keyof Question];
              const isSelected = selected === opt;
              const isCorrect = result?.correct_answer === opt;
              const isWrong = result && isSelected && !result.is_correct;

              return (
                <button
                  key={opt}
                  onClick={() => !result && handleAnswer(current.id, opt)}
                  disabled={!!result || submitting}
                  className={`w-full text-left px-5 py-3.5 rounded-xl border-2 transition ${
                    isCorrect ? "border-green-500 bg-green-50 text-green-800" :
                    isWrong ? "border-red-500 bg-red-50 text-red-800" :
                    isSelected ? "border-indigo-500 bg-indigo-50" :
                    "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                  }`}
                >
                  <span className="font-bold mr-2">{opt}.</span>
                  {optText}
                  {isCorrect && <span className="ml-2">✅</span>}
                  {isWrong && <span className="ml-2">❌</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 导航按钮 */}
      <div className="flex justify-between mt-4">
        <button
          onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
          disabled={currentIdx === 0}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg text-sm font-medium transition"
        >上一题</button>

        <div className="flex gap-2">
          {currentIdx < total - 1 ? (
            <button
              onClick={() => setCurrentIdx((prev) => prev + 1)}
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition"
            >下一题</button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold transition"
            >提交测试 ✅</button>
          )}
        </div>
      </div>
    </div>
  );
}
