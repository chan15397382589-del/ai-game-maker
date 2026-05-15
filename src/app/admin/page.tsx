"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";

// ============================================================
// 工具函数：获取当前 session token 用于 API 认证
// 先调用 getUser() 确保 auth 状态完全初始化
// ============================================================
async function getAuthToken(): Promise<string> {
  // 第1步：确保 auth 状态已初始化（getUser 会触发 session 恢复和刷新）
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    console.warn("[getAuthToken] 用户未登录:", error?.message);
    return "";
  }

  // 第2步：获取最新的 session token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn("[getAuthToken] session 已获取但 access_token 为空");
    return "";
  }
  return session.access_token;
}

// ============================================================
// 工具函数：下载 HTML 游戏文件
// ============================================================
function downloadHtml(code: string, title: string) {
  const blob = new Blob([code], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "游戏"}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// 主组件：教师管理后台
// ============================================================
export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState("");
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"students" | "messages" | "projects">("students");
  const router = useRouter();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push("/login");
      return;
    }
    setUser(data.user);

    // 查询 users 表，如果无记录也不拦截——API 层会自动初始化
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (userData && userData.role !== "admin") {
      router.push("/student");
      return;
    }
    setRole(userData?.role || "admin");
    setReady(true); // session 已就绪，子组件可以安全发请求了
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-indigo-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛠️</span>
            <h1 className="text-xl font-bold">教师管理后台</h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg text-sm transition"
          >
            退出登录
          </button>
        </div>
      </nav>

      {/* 标签页导航 */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-6">
          {[
            { key: "students", label: "👥 学生管理" },
            { key: "messages", label: "💬 对话审计" },
            { key: "projects", label: "🎮 作品审核" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-6 py-3 rounded-xl font-medium transition ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
      {!ready ? (
        <div className="bg-white rounded-2xl shadow-md p-12 text-center text-gray-400">
          <p className="animate-pulse text-lg">正在加载管理后台...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md p-6">
          {activeTab === "students" && <StudentsManagement />}
          {activeTab === "messages" && <MessagesAudit />}
          {activeTab === "projects" && <ProjectsReview />}
        </div>
      )}
      </div>
    </div>
  );
}

// ==================== 学生管理 ====================
function StudentsManagement() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStudentId, setNewStudentId] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // 导入相关
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // 获取学生列表 —— 使用服务端 API（携带真实 session token）
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        console.error("无法获取认证 token");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/students", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data || []);
        console.log("学生列表:", data?.length || 0, "条");
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("获取学生列表失败:", res.status, errData.error);
        alert("⚠️ 获取学生列表失败：" + (errData.error || `HTTP ${res.status}`));
      }
    } catch (err) {
      console.error("获取学生列表异常:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // Excel 导入处理
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/students/batch-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await res.json();
      setImportResult(result);

      if (res.ok) {
        alert(`✅ 导入完成！成功 ${result.success} 人，失败 ${result.failed} 人`);
        fetchStudents(); // 刷新列表
      } else {
        alert("❌ 导入失败：" + (result.error || "请检查 Excel 格式"));
      }
    } catch (err: any) {
      alert("导入异常：" + err.message);
    } finally {
      setImporting(false);
      // 清空 input 以便重复选择同一文件
      e.target.value = "";
    }
  };

  // 添加学生
  const handleAddStudent = async () => {
    if (!newName || !newStudentId || !newPassword) {
      alert("请填写完整信息！");
      return;
    }

    // 学生邮箱自动由学号生成：学号@ai-game.student
    const autoEmail = `${newStudentId.trim()}@ai-game.student`;

    try {
      const token = await getAuthToken();
      if (!token) {
        alert("⚠️ 未登录，请重新登录");
        return;
      }
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName,
          student_id: newStudentId,
          email: autoEmail,
          password: newPassword,
        }),
      });

      const result = await res.json().catch(() => ({ error: "服务器无响应" }));
      if (!res.ok) throw new Error(result.error || "创建失败 (HTTP " + res.status + ")");

      console.log("添加学生成功:", result);
      alert(result.message || "✅ 学生账号创建成功！学生使用学号即可登录");
      setShowAdd(false);
      setNewName("");
      setNewStudentId("");
      setNewPassword("");
      fetchStudents();
    } catch (err: any) {
      alert("❌ 创建失败：" + err.message);
    }
  };

  // 删除学生
  const handleDeleteStudent = async (userId: string, studentName: string) => {
    if (!confirm(`确定要删除学生「${studentName}」吗？此操作不可恢复！`)) return;

    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/students?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "删除失败");
      }

      alert("✅ 已删除");
      fetchStudents();
    } catch (err: any) {
      alert("❌ 删除失败：" + err.message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">学生账号管理</h2>
        <div className="flex gap-2">
          {/* 导入按钮 */}
          <label className="btn-secondary cursor-pointer">
            📥 导入学生名单
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
              disabled={importing}
            />
          </label>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
            ➕ 添加学生
          </button>
        </div>
      </div>

      {/* 导入提示 */}
      {!importResult && (
        <div className="text-xs text-gray-400 mb-3">
          💡 Excel 格式要求：第一列"姓名"，第二列"学号"，密码默认 123456
        </div>
      )}

      {/* 导入结果 */}
      {importResult && (
        <div className={`rounded-xl p-4 mb-4 text-sm ${
          importResult.failed === 0 ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
        }`}>
          <p className="font-medium mb-1">
            📊 导入结果：成功 {importResult.success} 人，失败 {importResult.failed} 人
          </p>
          {importResult.details?.filter((d: any) => d.status !== "成功").length > 0 && (
            <ul className="list-disc pl-4 mt-1 text-xs space-y-0.5">
              {importResult.details
                .filter((d: any) => d.status !== "成功")
                .map((d: any, i: number) => (
                  <li key={i}>
                    {d.name}（{d.student_id}）→ {d.status}：{d.error}
                  </li>
                ))}
            </ul>
          )}
          <button
            onClick={() => setImportResult(null)}
            className="text-xs underline mt-1 opacity-70 hover:opacity-100"
          >
            关闭提示
          </button>
        </div>
      )}

      {/* 添加学生表单 */}
      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-6 mb-6 space-y-4 border-2 border-dashed border-indigo-200">
          <h3 className="text-lg font-bold text-indigo-700">➕ 添加新学生</h3>
          <p className="text-sm text-gray-500">填写以下信息为学生创建登录账号（学生使用学号+密码登录）</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">姓名 <span className="text-red-500">*</span></label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" placeholder="如：张三" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">学号 <span className="text-red-500">*</span></label>
              <input value={newStudentId} onChange={(e) => setNewStudentId(e.target.value)} className="input-field" placeholder="如：202401001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">初始密码 <span className="text-red-500">*</span></label>
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" placeholder="设置学生登录密码" type="password" />
            </div>
            <div className="flex items-end justify-center pb-1">
              <p className="text-xs text-gray-400 bg-indigo-50 px-3 py-2 rounded-lg">
                💡 登录方式：学号 + 密码
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddStudent} className="btn-primary">确认添加</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary">取消</button>
          </div>
        </div>
      )}

      {/* 学生列表 */}
      {loading ? (
        <p className="text-center text-gray-400 py-8">加载中...</p>
      ) : students.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">📋</p>
          <p className="text-gray-500 text-lg">暂无学生数据</p>
          <p className="text-gray-400 text-sm mt-2">点击上方「添加学生」按钮添加第一位学生</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 font-semibold text-gray-700">姓名</th>
                <th className="py-3 px-4 font-semibold text-gray-700">学号</th>
                <th className="py-3 px-4 font-semibold text-gray-700">登录方式</th>
                <th className="py-3 px-4 font-semibold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-indigo-50 transition">
                  <td className="py-3 px-4 font-medium">{s.name}</td>
                  <td className="py-3 px-4 text-gray-600 font-mono text-sm">{s.student_id}</td>
                  <td className="py-3 px-4 text-sm"><span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full text-xs">学号登录</span></td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleDeleteStudent(s.id, s.name)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-sm transition"
                    >
                      🗑️ 删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 text-right">
            共 {students.length} 名学生
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 对话审计 ====================
function MessagesAudit() {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取学生列表（用于下拉选择）
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          console.error("[对话审计] 无法获取 token，跳过加载学生列表");
          return;
        }
        const res = await fetch("/api/admin/students", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStudents(data || []);
        } else {
          const err = await res.json().catch(() => ({}));
          console.error("[对话审计] 获取学生列表失败:", res.status, err.error);
        }
      } catch (err) {
        console.error("获取学生列表失败:", err);
      }
    };
    loadStudents();
  }, []);

  // 获取选中学生的聊天记录
  const handleSelectStudent = async (userId: string) => {
    setSelectedStudent(userId);
    if (!userId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/messages?user_id=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data || []);
      } else {
        console.error("获取对话记录失败:", res.status);
        setMessages([]);
      }
    } catch (err) {
      console.error("获取对话记录异常:", err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">📋 对话记录审计</h2>

      <div className="mb-6 bg-gray-50 rounded-xl p-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">选择要查看的学生：</label>
        <select
          value={selectedStudent}
          onChange={(e) => handleSelectStudent(e.target.value)}
          className="input-field w-80 max-w-full"
        >
          <option value="">-- 请选择学生 --</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}（{s.student_id}）
            </option>
          ))}
        </select>
        {students.length === 0 && (
          <p className="text-xs text-orange-500 mt-2">⚠️ 当前没有学生数据，请先在「学生管理」中添加学生</p>
        )}
      </div>

      {/* 聊天气泡展示 */}
      <div className="bg-gray-50 rounded-2xl p-6 max-h-[500px] overflow-y-auto space-y-3 min-h-[200px]">
        {loading ? (
          <div className="flex justify-center py-8">
            <span className="animate-pulse text-gray-400">加载对话记录中...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <p className="text-4xl mb-2">💬</p>
            <p>{selectedStudent ? "该学生暂无对话记录" : "请在上方选择一个学生查看对话记录"}</p>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-400 text-center pb-2 border-b">
              共 {messages.length} 条消息
            </div>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={msg.role === "user" ? "chat-bubble-user max-w-[80%]" : "chat-bubble-ai max-w-[80%]"}>
                  <p className="text-xs opacity-70 mb-1 font-medium">
                    {msg.role === "user" ? "👦 学生" : "🤖 小智老师"}
                    <span className="ml-2 opacity-50 text-[10px]">
                      {new Date(msg.created_at).toLocaleString("zh-CN")}
                    </span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ==================== 作品审核 ====================
function ProjectsReview() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<any>(null);

  // 获取所有作品列表
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/admin/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data || []);
      } else {
        console.error("获取作品列表失败:", res.status);
      }
    } catch (err) {
      console.error("获取作品列表异常:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">🎮 学生作品审核</h2>

      {loading ? (
        <p className="text-center text-gray-400 py-8">加载中...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">🎨</p>
          <p className="text-gray-500 text-lg">暂无作品数据</p>
          <p className="text-gray-400 text-sm mt-2">学生在创作游戏后，作品会出现在这里</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="edu-card p-4 hover:shadow-lg transition">
              <h3 className="font-bold text-lg mb-2 truncate" title={p.game_title}>
                🎮 {p.game_title}
              </h3>
              <p className="text-sm text-gray-500 mb-1">
                作者：{p.users?.name || "未知"} ({p.users?.student_id || "-"})
              </p>
              <p className="text-xs text-gray-400 mb-3">
                🕐 {new Date(p.created_at).toLocaleString("zh-CN")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedProject(p)}
                  className="btn-secondary text-sm flex-1"
                >
                  👀 预览
                </button>
                <button
                  onClick={() => downloadHtml(p.html_code, p.game_title)}
                  className="bg-green-500 hover:bg-green-600 text-white flex-1 rounded-xl px-3 py-2 text-sm font-medium transition"
                >
                  ⬇️ 下载
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 预览弹窗 */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProject(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold">🎮 {selectedProject.game_title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  作者：{selectedProject.users?.name} · {new Date(selectedProject.created_at).toLocaleString("zh-CN")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadHtml(selectedProject.html_code, selectedProject.game_title)}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  ⬇️ 下载
                </button>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="text-gray-400 hover:text-gray-800 text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 bg-gray-900 rounded-b-2xl">
              <iframe
                srcDoc={selectedProject.html_code}
                title={selectedProject.game_title}
                className="w-full h-full rounded-xl bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
