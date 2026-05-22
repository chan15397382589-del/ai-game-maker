"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";

// 角色类型
type LoginMode = "student" | "admin";

function clearStaleStorage() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("sb-") || key.startsWith("supabase."))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("student");
  const [checkingSession, setCheckingSession] = useState(true);
  // 管理员字段
  const [email, setEmail] = useState("");
  // 学生字段
  const [studentId, setStudentId] = useState("");
  // 公共字段
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // 检测是否已有活跃 session，自动跳转到对应门户
  // 如果 URL 带有 ?action=switch，则显示登录表单（用于切换账号）
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const isSwitch = searchParams.get("action") === "switch";

    if (isSwitch) {
      setCheckingSession(false);
      return;
    }

    // 先用 getSession 读取本地缓存（不触发网络请求，不会报 refresh token 错误）
    const checkAndRedirect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setCheckingSession(false); return; }

        const { data: userData, error: dbError } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (dbError) { clearStaleStorage(); setCheckingSession(false); return; }

        if (userData?.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/student");
        }
      } catch {
        clearStaleStorage();
        setCheckingSession(false);
      }
    };

    checkAndRedirect();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      if (mode === "student") {
        // ====== 学生登录：学号 + 密码 ======
        if (!studentId.trim()) {
          setError("请输入学号");
          return;
        }

        // 学号作为邮箱标识登录（注册时 email 格式为 学号@ai-game.student）
        const studentEmail = `${studentId.trim()}@ai-game.student`;

        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: studentEmail,
          password,
        });

        if (authError) throw authError;

        // 验证角色确实是学生
        const { data: userData } = await supabase
          .from("users")
          .select("role")
          .eq("id", data.user.id)
          .single();

        if (userData?.role === "admin") {
          throw new Error("该账号是管理员账号，请在管理员入口登录");
        }

        router.push("/student");
      } else {
        // ====== 管理员登录：邮箱 + 密码 ======
        if (!email.trim()) {
          setError("请输入管理员账号");
          return;
        }

        // "admin" 自动转为 admin@ai-game.admin
        const adminEmail = email.trim() === "admin" ? "admin@ai-game.admin" : email.trim();

        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password,
        });

        if (authError) throw authError;

        // 验证角色确实是管理员
        const { data: userData } = await supabase
          .from("users")
          .select("role")
          .eq("id", data.user.id)
          .single();

        if (userData?.role !== "admin") {
          throw new Error("该账号不是管理员账号，请在学生入口登录");
        }

        router.push("/admin");
      }
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
      <div className="edu-card p-8 w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <p className="text-6xl mb-4">🎮</p>
          <h1 className="text-2xl font-bold text-indigo-600">AI 游戏创作课堂</h1>
          <p className="text-gray-500 mt-2">请选择你的身份登录</p>
        </div>

        {/* 身份切换 Tab */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
          <button
            onClick={() => {
              setMode("student");
              setError("");
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              mode === "student"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🎒 学生登录
          </button>
          <button
            onClick={() => {
              setMode("admin");
              setError("");
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              mode === "admin"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            👩‍🏫 管理员登录
          </button>
        </div>

        {/* 表单区域 */}
        <div className="space-y-4">
          {mode === "student" ? (
            /* --- 学生表单 --- */
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学号</label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="请输入你的学号"
                  className="input-field"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="input-field"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <p className="text-xs text-gray-400 text-center">
                💡 提示：首次使用由老师统一分配账号
              </p>
            </>
          ) : (
            /* --- 管理员表单 --- */
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">管理员账号</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="输入 admin 即可登录"
                  className="input-field"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入管理员密码"
                  className="input-field"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
            </>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg">
              {error}
            </div>
          )}

          {/* 登录按钮 */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "登录中..." : mode === "student" ? "🎒 学生登录" : "👩‍🏫 管理员登录"}
          </button>
        </div>

        {/* 底部说明 */}
        <div className="mt-6 text-center text-xs text-gray-400">
          {mode === "student" ? (
            <p>是老师？请切换到 👩‍🏫 管理员登录</p>
          ) : (
            <p>是学生？请切换到 🎒 学生登录</p>
          )}
        </div>
      </div>
    </div>
  );
}
