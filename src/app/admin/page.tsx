"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

// ============================================================
// 常量与类型
// ============================================================
const GRADES = [
  { value: 3, label: "三年级" },
  { value: 4, label: "四年级" },
  { value: 5, label: "五年级" },
  { value: 6, label: "六年级" },
] as const;

interface StudentRow {
  id?: string;
  name: string;
  student_id: string;
  gender: string;
  grade: number | null;
  class_num: number | null;
  password?: string;
  status?: string;
  created_at?: string;
}

interface TreeNode {
  type: "all" | "grade" | "class";
  grade?: number;
  classNum?: number;
  label: string;
  count?: number;
}

// ============================================================
// 工具函数
// ============================================================
async function getAuthToken(): Promise<string> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return "";
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch {
    return "";
  }
}

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

function gradeLabel(g: number | null): string {
  if (g === null || g === undefined) return "-";
  return GRADES.find((gr) => gr.value === g)?.label || `${g}年级`;
}

// ============================================================
// 主组件：教师管理后台
// ============================================================
export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState("");
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"students" | "messages" | "projects" | "classifications">("students");
  const router = useRouter();

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) router.push("/login");
        else if (user && data.user.id !== user.id) checkUser();
      } catch {
        router.push("/login");
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [ready, user]);

  const checkUser = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      setUser(data.user);
      const { data: userData } = await supabase.from("users").select("role").eq("id", data.user.id).single();
      if (userData && userData.role !== "admin") { router.push("/student"); return; }
      setRole(userData?.role || "admin");
      setReady(true);
    } catch {
      router.push("/login");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛠️</span>
            <h1 className="text-xl font-bold">教师管理后台</h1>
          </div>
          <button onClick={handleLogout} className="bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg text-sm transition">
            退出登录
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-6">
          {[
            { key: "students", label: "👥 学生管理" },
            { key: "messages", label: "💬 对话记录" },
            { key: "projects", label: "🎮 作品审核" },
            { key: "classifications", label: "📊 学生分类" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-6 py-3 rounded-xl font-medium transition ${
                activeTab === tab.key ? "bg-indigo-600 text-white shadow-md" : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!ready ? (
          <div className="bg-white rounded-2xl shadow-md p-12 text-center text-gray-400">
            <p className="animate-pulse text-lg">正在加载管理后台...</p>
          </div>
        ) : (
          activeTab === "students" ? (
            <StudentsManagement />
          ) : activeTab === "classifications" ? (
            <ClassificationsView />
          ) : (
            <div className="bg-white rounded-2xl shadow-md p-6">
              {activeTab === "messages" && <MessagesAudit />}
              {activeTab === "projects" && <ProjectsReview />}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================
// 学生管理（核心重写：左侧树 + 右侧面板）
// ============================================================
function StudentsManagement() {
  const router = useRouter();
  // 左侧树状态
  const [selectedNode, setSelectedNode] = useState<TreeNode>({ type: "all", label: "全部学生" });
  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set([3]));
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});

  // 右侧数据状态
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  // 弹窗状态
  const [showAdd, setShowAdd] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    grade: number;
    classNum: number;
    rows: (StudentRow & { _error?: string; _dup?: boolean })[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // 批量操作状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [resettingPwd, setResettingPwd] = useState(false);

  // 新增学生表单
  const [addForm, setAddForm] = useState({ name: "", student_id: "", gender: "男", grade: 3, class_num: 1, password: "123456" });

  // 编辑学生
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [editForm, setEditForm] = useState({ student_id: "", grade: 3, class_num: 1 });
  const [savingEdit, setSavingEdit] = useState(false);

  // ---- 获取学生列表 ----
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) { setLoading(false); return; }
      const params = new URLSearchParams();
      if (selectedNode.type === "grade" && selectedNode.grade) params.set("grade", String(selectedNode.grade));
      if (selectedNode.type === "class" && selectedNode.grade) params.set("grade", String(selectedNode.grade));
      if (selectedNode.type === "class" && selectedNode.classNum) params.set("class_num", String(selectedNode.classNum));
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`/api/admin/students?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setStudents(data || []);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("获取学生列表失败：" + (err.error || `HTTP ${res.status}`));
      }
    } catch (err: any) {
      alert("获取学生列表异常：" + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedNode, keyword]);

  // ---- 获取班级人数统计 ----
  const fetchCounts = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/admin/students", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: StudentRow[] = await res.json();
        const counts: Record<string, number> = { all: data.length };
        data.forEach((s) => {
          if (s.grade) counts[`g${s.grade}`] = (counts[`g${s.grade}`] || 0) + 1;
          if (s.grade && s.class_num) counts[`g${s.grade}_c${s.class_num}`] = (counts[`g${s.grade}_c${s.class_num}`] || 0) + 1;
        });
        setClassCounts(counts);
      }
    } catch (err) {
      console.error("获取班级统计失败:", err);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ---- 树操作 ----
  const toggleGrade = (g: number) => {
    const next = new Set(expandedGrades);
    if (next.has(g)) next.delete(g); else next.add(g);
    setExpandedGrades(next);
  };

  const selectNode = (node: TreeNode) => {
    setSelectedNode(node);
    setKeyword("");
  };

  // ---- 下载导入模板 ----
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["序号", "学生姓名", "学号", "班级", "备注"],
      [1, "张三", "202401001", "1班", ""],
      [2, "李四", "202401002", "2班", ""],
      [3, "王五", "202401003", "1班", "转学生"],
    ]);
    ws["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "学生名单");
    XLSX.writeFile(wb, "学生导入模板.xlsx");
  };

  // ---- 选择并解析 Excel 文件 ----
  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 当前选中的年级（必须选中年级才能导入）
    const targetGrade = selectedNode.grade;
    const targetClassNum = selectedNode.classNum; // 可选：具体班级

    if (!targetGrade) {
      alert("请先在左侧导航选择一个年级（如：三年级），再导入学生");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          alert("文件中没有数据");
          return;
        }

        // 获取已有学号集合（前端预校验用）
        const existingIds = new Set(students.map((s) => s.student_id));

        // 解析班级列：支持 "1班"、"1"、"班1" 等格式
        const parseClassNum = (val: any): number | null => {
          const s = String(val || "").trim().replace(/班$/, "").trim();
          const n = parseInt(s);
          return isNaN(n) ? null : n;
        };

        const parsed: (StudentRow & { _error?: string; _dup?: boolean; _note?: string })[] = rows.map((r) => {
          const name = String(r["学生姓名"] || r["姓名"] || r["name"] || r["Name"] || "").trim();
          const student_id = String(r["学号"] || r["student_id"] || r["StudentId"] || "").trim();
          const gender = String(r["性别"] || r["gender"] || "").trim();
          const note = String(r["备注"] || r["note"] || "").trim();

          // 班级：优先用 Excel 列，没有则用左侧选中
          const fileClassNum = parseClassNum(r["班级"] || r["class"] || r["class_num"]);
          const classNum: number | null = fileClassNum || targetClassNum || null;

          const errors: string[] = [];
          const dup = existingIds.has(student_id);
          if (!name) errors.push("姓名为空");
          if (!student_id) errors.push("学号为空");
          if (dup) errors.push("学号已存在");
          if (!classNum) errors.push("班级为空（请在Excel填写班级列，或在左侧选择具体班级）");

          return {
            name,
            student_id,
            gender: gender || "男",
            grade: targetGrade,
            class_num: classNum,
            password: "123456",
            _error: errors.join("；"),
            _dup: dup,
            _note: note,
          };
        });

        setPreviewData({ grade: targetGrade, classNum: targetClassNum || 0, rows: parsed });
        setShowImportPreview(true);
      } catch (err: any) {
        alert("文件解析失败：" + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // ---- 确认导入 ----
  const handleConfirmImport = async () => {
    if (!previewData) return;
    const validRows = previewData.rows.filter((r) => !r._error);
    if (validRows.length === 0) {
      alert("没有可导入的有效数据");
      return;
    }

    setImporting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          grade: previewData.grade,
          students: validRows.map(({ name, student_id, gender, class_num, password }) => ({ name, student_id, gender, class_num, password })),
        }),
      });
      const result = await res.json();
      if (res.ok) {
        const failedDetails = (result.details || []).filter((d: any) => d.status !== "成功").map((d: any) => `${d.name}(${d.student_id}): ${d.error || d.status}`).join("\n");
        const msg = `导入完成！成功 ${result.success} 人，失败 ${result.failed} 人`;
        if (failedDetails) alert(msg + "\n\n失败详情：\n" + failedDetails);
        else alert(msg);
        setShowImportPreview(false);
        setPreviewData(null);
        fetchStudents();
        fetchCounts();
      } else {
        alert("导入失败：" + (result.error || "未知错误"));
      }
    } catch (err: any) {
      alert("导入异常：" + err.message);
    } finally {
      setImporting(false);
    }
  };

  // ---- 新增学生 ----
  const handleAddStudent = async () => {
    if (!addForm.name.trim() || !addForm.student_id.trim()) {
      alert("请填写姓名和学号");
      return;
    }
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          grade: addForm.grade,
          students: [{ name: addForm.name, student_id: addForm.student_id, gender: addForm.gender, class_num: addForm.class_num, password: addForm.password }],
        }),
      });
      const result = await res.json();
      if (res.ok) {
        const detail = result.details?.[0];
        if (detail?.status === "成功") {
          alert("添加成功！");
          setShowAdd(false);
          setAddForm({ name: "", student_id: "", gender: "男", grade: 3, class_num: 1, password: "123456" });
          fetchStudents();
          fetchCounts();
        } else {
          alert("添加失败：" + (detail?.error || detail?.status || "未知错误"));
        }
      } else {
        alert("添加失败：" + (result.error || "未知错误"));
      }
    } catch (err: any) {
      alert("添加异常：" + err.message);
    }
  };

  // ---- 删除学生 ----
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
      fetchStudents();
      fetchCounts();
    } catch (err: any) {
      alert("删除失败：" + err.message);
    }
  };

  // ---- 编辑学生 ----
  const handleEditStudent = (s: StudentRow) => {
    setEditStudent(s);
    setEditForm({
      student_id: s.student_id || "",
      grade: s.grade || 3,
      class_num: s.class_num || 1,
    });
  };

  const handleSaveEdit = async () => {
    if (!editStudent?.id) return;
    setSavingEdit(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editStudent.id,
          student_id: editForm.student_id.trim(),
          grade: editForm.grade,
          class_num: editForm.class_num,
        }),
      });
      if (res.ok) {
        setEditStudent(null);
        fetchStudents();
        fetchCounts();
      } else {
        const err = await res.json();
        alert("修改失败：" + (err.error || "未知错误"));
      }
    } catch (err: any) {
      alert("修改异常：" + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // ---- 批量选择 ----
  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id!)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ---- 批量删除 ----
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 名学生吗？此操作不可恢复！`)) return;
    setBatchDeleting(true);
    try {
      const token = await getAuthToken();
      let success = 0;
      let failed = 0;
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/students?userId=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) success++;
        else failed++;
      }
      setSelectedIds(new Set());
      fetchStudents();
      fetchCounts();
      alert(`删除完成：成功 ${success} 人${failed > 0 ? `，失败 ${failed} 人` : ""}`);
    } catch (err: any) {
      alert("批量删除失败：" + err.message);
    } finally {
      setBatchDeleting(false);
    }
  };

  // ---- 重置当前视图所有学生密码为 123456 ----
  const handleResetAllPasswords = async () => {
    if (students.length === 0) return;
    const label = selectedNode.type === "class"
      ? `${gradeLabel(selectedNode.grade!)}${selectedNode.classNum}班`
      : selectedNode.label;
    if (!confirm(`确定要将「${label}」的 ${students.length} 名学生密码全部重置为 123456 吗？`)) return;
    setResettingPwd(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/admin/students/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_ids: students.map((s) => s.id), password: "123456" }),
      });
      const result = await res.json();
      if (res.ok) {
        alert(`密码重置完成！成功 ${result.success} 人，失败 ${result.failed} 人`);
      } else {
        alert("重置失败：" + (result.error || "未知错误"));
      }
    } catch (err: any) {
      alert("重置异常：" + err.message);
    } finally {
      setResettingPwd(false);
    }
  };

  // ---- 导出表格 ----
  const handleExport = () => {
    if (students.length === 0) { alert("没有数据可导出"); return; }
    const ws = XLSX.utils.json_to_sheet(
      students.map((s) => ({
        姓名: s.name,
        学号: s.student_id,
        性别: s.gender || "-",
        年级: gradeLabel(s.grade),
        班级: s.class_num ? `${s.class_num}班` : "-",
      }))
    );
    ws["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 6 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "学生列表");
    const fileName = selectedNode.type === "class"
      ? `${gradeLabel(selectedNode.grade!)}${selectedNode.classNum}班_学生名单.xlsx`
      : `学生名单_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // ---- 搜索 ----
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);
  };

  // ========================================
  // 渲染
  // ========================================
  return (
    <div className="flex gap-4 h-[calc(100vh-160px)] min-h-[500px]">
      {/* ========== 左侧导航树 ========== */}
      <div className="w-56 bg-white rounded-2xl shadow-md border border-gray-100 overflow-y-auto shrink-0 p-3">
        {/* 全部学生 */}
        <div
          onClick={() => selectNode({ type: "all", label: "全部学生" })}
          className={`px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium transition mb-1 flex items-center justify-between ${
            selectedNode.type === "all"
              ? "bg-indigo-600 text-white shadow-md"
              : "text-gray-700 hover:bg-indigo-50"
          }`}
        >
          <span>📋 全部学生</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${selectedNode.type === "all" ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
            {classCounts.all || 0}
          </span>
        </div>

        <div className="border-t border-gray-100 my-2" />

        {/* 年级列表 */}
        {GRADES.map((g) => {
          const isExpanded = expandedGrades.has(g.value);
          const gCount = classCounts[`g${g.value}`] || 0;
          return (
            <div key={g.value}>
              {/* 年级节点 */}
              <div
                onClick={() => {
                  selectNode({ type: "grade", grade: g.value, label: g.label });
                  toggleGrade(g.value);
                }}
                className={`px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition flex items-center justify-between ${
                  selectedNode.type === "grade" && selectedNode.grade === g.value
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className={`inline-block transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                  {g.label}
                </span>
                <span className="text-xs text-gray-400">{gCount}</span>
              </div>

              {/* 班级子节点 */}
              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => {
                    const cCount = classCounts[`g${g.value}_c${c}`] || 0;
                    const isSelected = selectedNode.type === "class" && selectedNode.grade === g.value && selectedNode.classNum === c;
                    return (
                      <div
                        key={c}
                        onClick={() => selectNode({ type: "class", grade: g.value, classNum: c, label: `${g.label} ${c}班` })}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm transition flex items-center justify-between ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{c}班</span>
                        {cCount > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20" : "bg-gray-100 text-gray-400"}`}>
                            {cCount}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ========== 右侧数据面板 ========== */}
      <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden">
        {/* 顶部操作栏 */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          {/* 当前位置 + 操作按钮 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-gray-800">
              {selectedNode.label}
              <span className="text-sm font-normal text-gray-400 ml-2">({students.length} 人)</span>
            </h2>
            <div className="flex gap-2 flex-wrap">
              <button onClick={downloadTemplate} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition flex items-center gap-1">
                📥 下载模板
              </button>
              <label className={`bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                selectedNode.type === "all" ? "opacity-50 pointer-events-none" : ""
              }`} title={selectedNode.type === "all" ? "请先选择一个年级" : ""}>
                📤 批量导入
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleSelectFile} className="hidden" />
              </label>
              <button onClick={() => setShowAdd(true)} className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition flex items-center gap-1">
                ➕ 新增学生
              </button>
              <button onClick={handleResetAllPasswords} disabled={resettingPwd || students.length === 0}
                className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition flex items-center gap-1 disabled:opacity-50">
                {resettingPwd ? "重置中..." : "🔑 重置密码"}
              </button>
            </div>
          </div>
          {/* 搜索框 */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              value={keyword}
              onChange={handleSearch}
              placeholder="搜索姓名或学号..."
              className="input-field pl-9 text-sm"
            />
          </div>
          {/* 批量操作栏 */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-indigo-50 px-3 py-2 rounded-lg">
              <span className="text-sm text-indigo-700 font-medium">已选 {selectedIds.size} 人</span>
              <button onClick={handleBatchDelete} disabled={batchDeleting}
                className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                {batchDeleting ? "删除中..." : "🗑️ 批量删除"}
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1">
                取消选择
              </button>
            </div>
          )}
        </div>

        {/* 主体：数据表格 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <span className="animate-pulse text-sm">加载中...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-4xl mb-2">📋</p>
              <p className="text-sm">暂无学生数据</p>
              <p className="text-xs mt-1">点击「新增学生」或「批量导入」添加</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-3 w-10">
                    <input type="checkbox" checked={students.length > 0 && selectedIds.size === students.length}
                      onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer" />
                  </th>
                  <th className="py-3 px-4 font-semibold text-gray-700">姓名</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">学号</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">年级</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">班级</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">创建时间</th>
                  <th className="py-3 px-4 font-semibold text-gray-700 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className={`border-b border-gray-50 hover:bg-indigo-50/50 transition ${selectedIds.has(s.id!) ? "bg-indigo-50" : ""}`}>
                    <td className="py-2.5 px-3">
                      <input type="checkbox" checked={selectedIds.has(s.id!)} onChange={() => toggleSelect(s.id!)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer" />
                    </td>
                    <td className="py-2.5 px-4 font-medium">{s.name}</td>
                    <td className="py-2.5 px-4 text-gray-600 font-mono text-xs">{s.student_id}</td>
                    <td className="py-2.5 px-4 text-gray-500">{gradeLabel(s.grade)}</td>
                    <td className="py-2.5 px-4 text-gray-500">{s.class_num ? `${s.class_num}班` : "-"}</td>
                    <td className="py-2.5 px-4 text-gray-400 text-xs">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString("zh-CN") : "-"}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/admin/student-view/${s.id}`)}
                          className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded text-xs transition"
                        >
                          查看
                        </button>
                        <button
                          onClick={() => handleEditStudent(s)}
                          className="text-amber-500 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded text-xs transition"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(s.id!, s.name)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-xs transition"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========== 新增学生弹窗 ========== */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">➕ 新增学生</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">姓名 *</label>
                  <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="input-field text-sm" placeholder="张三" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">学号 *</label>
                  <input value={addForm.student_id} onChange={(e) => setAddForm({ ...addForm, student_id: e.target.value })} className="input-field text-sm" placeholder="202401001" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">性别</label>
                  <select value={addForm.gender} onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })} className="input-field text-sm">
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">年级</label>
                  <select value={addForm.grade} onChange={(e) => setAddForm({ ...addForm, grade: parseInt(e.target.value) })} className="input-field text-sm">
                    {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">班级</label>
                  <select value={addForm.class_num} onChange={(e) => setAddForm({ ...addForm, class_num: parseInt(e.target.value) })} className="input-field text-sm">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}班</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">初始密码</label>
                <input value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} className="input-field text-sm" type="text" />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">取消</button>
              <button onClick={handleAddStudent} className="btn-primary text-sm">确认添加</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 编辑学生弹窗 ========== */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditStudent(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">✏️ 编辑 {editStudent.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">学号</label>
                <input value={editForm.student_id} onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })} className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">年级</label>
                  <select value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: parseInt(e.target.value) })} className="input-field text-sm">
                    {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">班级</label>
                  <select value={editForm.class_num} onChange={(e) => setEditForm({ ...editForm, class_num: parseInt(e.target.value) })} className="input-field text-sm">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}班</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-5 justify-end">
                <button onClick={() => setEditStudent(null)} className="btn-secondary text-sm">取消</button>
                <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.student_id.trim()} className="btn-primary text-sm disabled:opacity-50">
                  {savingEdit ? "保存中..." : "确认修改"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 导入预览弹窗 ========== */}
      {showImportPreview && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowImportPreview(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* 弹窗头部 */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800">📤 导入预览</h3>
                <p className="text-xs text-gray-500 mt-1">
                  目标：{gradeLabel(previewData.grade)} {previewData.classNum}班 · 共 {previewData.rows.length} 条记录
                </p>
              </div>
              <button onClick={() => setShowImportPreview(false)} className="text-gray-400 hover:text-gray-700 text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                ✕
              </button>
            </div>

            {/* 预览表格 */}
            <div className="flex-1 overflow-auto p-4">
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className="py-2 px-3 font-semibold text-gray-700 w-8">状态</th>
                      <th className="py-2 px-3 font-semibold text-gray-700">姓名</th>
                      <th className="py-2 px-3 font-semibold text-gray-700">学号</th>
                      <th className="py-2 px-3 font-semibold text-gray-700">班级</th>
                      <th className="py-2 px-3 font-semibold text-gray-700">备注</th>
                      <th className="py-2 px-3 font-semibold text-gray-700">问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i} className={`border-b border-gray-50 ${row._error ? "bg-red-50" : ""}`}>
                        <td className="py-2 px-3 text-center">
                          {row._error ? (
                            <span className="inline-block w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-5 text-center">✕</span>
                          ) : (
                            <span className="inline-block w-5 h-5 rounded-full bg-green-500 text-white text-xs leading-5 text-center">✓</span>
                          )}
                        </td>
                        <td className={`py-2 px-3 ${!row.name ? "text-red-500 font-bold" : "font-medium"}`}>
                          {row.name || "(空)"}
                        </td>
                        <td className={`py-2 px-3 font-mono text-xs ${row._dup ? "text-red-500 font-bold" : "text-gray-600"}`}>
                          {row.student_id || "(空)"}
                        </td>
                        <td className="py-2 px-3 text-gray-500">{row.class_num ? `${row.class_num}班` : <span className="text-red-500">未指定</span>}</td>
                        <td className="py-2 px-3 text-gray-400 text-xs">{(row as any)._note || "-"}</td>
                        <td className="py-2 px-3 text-xs">
                          {row._error ? (
                            <span className="text-red-600">{row._error}</span>
                          ) : (
                            <span className="text-green-600">正常</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 统计信息 */}
              <div className="mt-3 flex gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  ✓ 可导入：{previewData.rows.filter((r) => !r._error).length} 人
                </span>
                <span className="text-red-600 font-medium">
                  ✕ 有问题：{previewData.rows.filter((r) => r._error).length} 人
                </span>
              </div>
            </div>

            {/* 弹窗底部按钮 */}
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowImportPreview(false)}
                className="btn-secondary text-sm"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing || previewData.rows.filter((r) => !r._error).length === 0}
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? "导入中..." : `确认导入 (${previewData.rows.filter((r) => !r._error).length} 人)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 对话记录 ====================
function MessagesAudit() {
  // 树导航状态
  const [selectedNode, setSelectedNode] = useState<TreeNode>({ type: "all", label: "全部学生" });
  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set());
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});

  // 学生和对话状态
  const [students, setStudents] = useState<any[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [codeModal, setCodeModal] = useState<{ open: boolean; code: string; time: string }>({ open: false, code: "", time: "" });
  const [exporting, setExporting] = useState(false);
  const [reflections, setReflections] = useState<any[]>([]);
  const [loadingReflections, setLoadingReflections] = useState(false);

  // 获取统计
  const fetchCounts = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/admin/students", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: any[] = await res.json();
        const counts: Record<string, number> = { all: data.length };
        data.forEach((s: any) => {
          if (s.grade) counts[`g${s.grade}`] = (counts[`g${s.grade}`] || 0) + 1;
          if (s.grade && s.class_num) counts[`g${s.grade}_c${s.class_num}`] = (counts[`g${s.grade}_c${s.class_num}`] || 0) + 1;
        });
        setClassCounts(counts);
      }
    } catch (err) { console.error("获取统计失败:", err); }
  }, []);

  // 获取学生列表（根据选中节点筛选）
  const fetchStudents = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (selectedNode.type === "grade" && selectedNode.grade) params.set("grade", String(selectedNode.grade));
      if (selectedNode.type === "class" && selectedNode.grade) params.set("grade", String(selectedNode.grade));
      if (selectedNode.type === "class" && selectedNode.classNum) params.set("class_num", String(selectedNode.classNum));
      const res = await fetch(`/api/admin/students?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setStudents(data || []);
        setFilteredStudents(data || []);
      }
    } catch (err) { console.error("获取学生列表失败:", err); }
  }, [selectedNode]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const toggleGrade = (g: number) => {
    const next = new Set(expandedGrades);
    if (next.has(g)) next.delete(g); else next.add(g);
    setExpandedGrades(next);
  };

  const selectNode = (node: TreeNode) => {
    setSelectedNode(node);
    setSelectedStudent("");
    setSessions([]);
    setMessages([]);
    setSelectedSession(null);
    setReflections([]);
  };

  const handleSelectStudent = async (userId: string) => {
    setSelectedStudent(userId);
    setSelectedSession(null);
    setMessages([]);
    setReflections([]);
    if (!userId) { setSessions([]); return; }
    setLoading(true);
    setLoadingReflections(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/sessions?user_id=${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSessions(await res.json() || []);
    } catch (err) { setSessions([]); }
    finally { setLoading(false); }
    try {
      const token = await getAuthToken();
      const convRes = await fetch(`/api/admin/conversations?user_id=${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (convRes.ok) {
        const allConvs = await convRes.json();
        setReflections(allConvs.filter((c: any) => c.reflection));
      }
    } catch {}
    setLoadingReflections(false);
  };

  const handleSelectSession = async (session: any) => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const convRes = await fetch(`/api/admin/conversations?id=${encodeURIComponent(session.session_id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (convRes.ok) {
        const convData = await convRes.json();
        session = { ...session, reflection: convData?.reflection || null };
      }
      setSelectedSession(session);
      const res = await fetch(`/api/admin/messages?user_id=${encodeURIComponent(selectedStudent)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const allMessages = await res.json();
        const filtered = allMessages.filter((m: any) => {
          const t = new Date(m.created_at).getTime();
          return t >= new Date(session.start_time).getTime() && t <= new Date(session.end_time).getTime();
        });
        setMessages(filtered);
      }
    } catch (err) { setMessages([]); }
    finally { setLoading(false); }
  };

  const extractCode = (content: string): string | null => {
    const match = content.match(/```html\s*([\s\S]*?)```/i);
    if (match) return match[1].trim();
    const genericMatch = content.match(/```\s*([\s\S]*?)```/);
    if (genericMatch && /<\w/.test(genericMatch[1])) return genericMatch[1].trim();
    return null;
  };

  const handleViewCode = (content: string, time: string) => {
    const code = extractCode(content);
    if (code) setCodeModal({ open: true, code, time });
  };

  const exportConversation = () => {
    if (messages.length === 0) return;
    const lines = messages.map((msg) => {
      const time = new Date(msg.created_at).toLocaleString("zh-CN");
      const who = msg.role === "user" ? "👦 学生" : "🤖 小智老师";
      return `[${time}] ${who}\n${msg.content}\n`;
    });
    const text = lines.join("\n---\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedSession?.first_user_message?.substring(0, 20) || "对话记录"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportToExcel = async (allStudents: boolean) => {
    setExporting(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const url = allStudents
        ? "/api/admin/messages/export"
        : `/api/admin/messages/export?user_id=${encodeURIComponent(selectedStudent)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("导出失败"); return; }
      const students = await res.json();
      let maxTurns = 0;
      students.forEach((s: any) => { if (s.turns.length > maxTurns) maxTurns = s.turns.length; });
      const headers: string[] = ["时间", "年级", "班级", "学生姓名", "学号"];
      for (let i = 0; i < maxTurns; i++) headers.push(`第${i + 1}轮`);
      const rows = students.map((s: any) => {
        const row: any = {
          "时间": s.first_time, "年级": s.grade ? `${s.grade}年级` : "",
          "班级": s.class_num ? `${s.class_num}班` : "",
          "学生姓名": s.student_name, "学号": s.student_id,
        };
        for (let i = 0; i < maxTurns; i++) {
          const turn = s.turns[i];
          row[`第${i + 1}轮`] = turn ? `[${turn.role}] ${turn.content}` : "";
        }
        return row;
      });
      const headerRow = headers;
      const dataRows = rows.map((r: any) => headers.map((h: string) => r[h] || ""));
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      ws["!cols"] = headers.map((h) => {
        if (h === "学生姓名") return { wch: 10 };
        if (h.includes("第") && h.includes("轮")) return { wch: 35 };
        return { wch: 10 };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "对话记录");
      XLSX.writeFile(wb, allStudents ? `全部学生对话记录_${new Date().toISOString().slice(0, 10)}.xlsx` : `${studentName}_对话记录.xlsx`);
    } catch (err) { alert("导出失败，请重试"); }
    finally { setExporting(false); }
  };

  const studentName = students.find((s) => s.id === selectedStudent)?.name || "";

  return (
    <div className="flex gap-4 h-[calc(100vh-160px)] min-h-[500px]">
      {/* 左侧树导航 */}
      <div className="w-52 bg-white rounded-2xl shadow-md border border-gray-100 overflow-y-auto shrink-0 p-3">
        <div
          onClick={() => selectNode({ type: "all", label: "全部学生" })}
          className={`px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium transition mb-1 flex items-center justify-between ${
            selectedNode.type === "all" ? "bg-indigo-600 text-white shadow-md" : "text-gray-700 hover:bg-indigo-50"
          }`}
        >
          <span>📋 全部学生</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${selectedNode.type === "all" ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
            {classCounts.all || 0}
          </span>
        </div>
        <div className="border-t border-gray-100 my-2" />
        {GRADES.map((g) => {
          const isExpanded = expandedGrades.has(g.value);
          const gCount = classCounts[`g${g.value}`] || 0;
          return (
            <div key={g.value}>
              <div
                onClick={() => { selectNode({ type: "grade", grade: g.value, label: g.label }); toggleGrade(g.value); }}
                className={`px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition flex items-center justify-between ${
                  selectedNode.type === "grade" && selectedNode.grade === g.value ? "bg-indigo-100 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className={`inline-block transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                  {g.label}
                </span>
                <span className="text-xs text-gray-400">{gCount}</span>
              </div>
              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => {
                    const cCount = classCounts[`g${g.value}_c${c}`] || 0;
                    const isSelected = selectedNode.type === "class" && selectedNode.grade === g.value && selectedNode.classNum === c;
                    return (
                      <div key={c}
                        onClick={() => selectNode({ type: "class", grade: g.value, classNum: c, label: `${g.label} ${c}班` })}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm transition flex items-center justify-between ${
                          isSelected ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{c}班</span>
                        {cCount > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20" : "bg-gray-100 text-gray-400"}`}>{cCount}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">📋 对话记录审计</h2>

        <div className="mb-6 bg-gray-50 rounded-xl p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              选择学生（{selectedNode.label}）：
            </label>
            <select value={selectedStudent} onChange={(e) => handleSelectStudent(e.target.value)} className="input-field w-80 max-w-full">
              <option value="">-- 请选择学生 --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}（{s.student_id}）{s.grade ? ` ${gradeLabel(s.grade)}` : ""}{s.class_num ? `${s.class_num}班` : ""}</option>
              ))}
            </select>
          </div>
          <button onClick={() => exportToExcel(true)} disabled={exporting}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
            {exporting ? "导出中..." : "📊 导出对话记录"}
          </button>
          <span className="text-xs text-gray-300 mx-1">|</span>
          <button onClick={async () => {
            setExporting(true);
            try {
              const token = await getAuthToken();
              if (!token) return;
              const res = await fetch("/api/admin/conversations?all=1", { headers: { Authorization: `Bearer ${token}` } });
              if (!res.ok) { alert("导出失败"); return; }
              const data = await res.json();
              const rows = data.map((c: any) => {
                let ref: any = {};
                try { ref = typeof c.reflection === "string" ? JSON.parse(c.reflection) : c.reflection; } catch {}
                return {
                  "学生姓名": c.student_name, "学号": c.student_id,
                  "年级": c.grade ? `${c.grade}年级` : "", "班级": c.class_num ? `${c.class_num}班` : "",
                  "对话标题": c.title,
                  "卡片1-说说你的游戏": ref.card1 || "", "卡片2-最得意的设计": ref.card2 || "", "卡片3-下次想加什么": ref.card3 || "",
                  "更新时间": new Date(c.updated_at).toLocaleString("zh-CN"),
                };
              });
              const ws = XLSX.utils.json_to_sheet(rows);
              ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 45 }, { wch: 45 }, { wch: 45 }, { wch: 20 }];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "学生反馈");
              XLSX.writeFile(wb, `学生反馈_${new Date().toISOString().slice(0, 10)}.xlsx`);
            } catch { alert("导出失败"); }
            finally { setExporting(false); }
          }}
          disabled={exporting}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
            {exporting ? "导出中..." : "📊 导出学生反馈"}
          </button>
        </div>

        {selectedStudent && (
          <div className="flex gap-4">
            <div className="w-72 bg-gray-50 rounded-xl p-3 max-h-[400px] overflow-y-auto shrink-0">
              <p className="text-sm font-semibold text-gray-600 mb-2">📂 对话记录（{sessions.length}）</p>
              {loading && !selectedSession ? <p className="text-xs text-gray-400 text-center py-4">加载中...</p> :
              sessions.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">暂无对话记录</p> : (
                <div className="space-y-1">
                  {sessions.map((s, i) => (
                    <div key={s.session_id} onClick={() => handleSelectSession(s)}
                      className={`px-3 py-2 rounded-lg cursor-pointer text-sm transition ${
                        selectedSession?.session_id === s.session_id ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-100 text-gray-600"
                      }`}>
                      <p className="font-medium truncate">📝 {s.first_user_message || `对话 ${i + 1}`}</p>
                      <p className="text-xs opacity-60 mt-0.5">
                        {s.message_count} 条消息 · {new Date(s.last_message_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 bg-gray-50 rounded-2xl p-4 max-h-[400px] overflow-y-auto min-h-[200px] relative">
              {loading ? <div className="flex justify-center py-8"><span className="animate-pulse text-gray-400">加载中...</span></div> :
              !selectedSession ? <div className="flex flex-col items-center justify-center py-8 text-gray-400"><p className="text-4xl mb-2">💬</p><p>请在左侧选择对话</p></div> :
              messages.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-gray-400"><p className="text-4xl mb-2">💬</p><p>暂无消息</p></div> : (
                <div className="space-y-3">
                  <div className="text-xs text-gray-400 text-center pb-2 border-b">
                    📝 {selectedSession.first_user_message || "对话"} — 共 {messages.length} 条消息
                  </div>
                  {selectedSession.reflection && <ReflectionCard reflectionJson={selectedSession.reflection} />}
                  {messages.map((msg, i) => {
                    const hasCode = msg.role === "assistant" && extractCode(msg.content);
                    const displayContent = msg.content.replace(/```html[\s\S]*?```/g, "").replace(/```[\s\S]*?```/g, "").trim() || msg.content;
                    return (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={msg.role === "user" ? "chat-bubble-user max-w-[80%]" : "chat-bubble-ai max-w-[80%]"}>
                        <p className="text-xs opacity-70 mb-1 font-medium flex items-center gap-2">
                          <span>{msg.role === "user" ? "👦 学生" : "🤖 小智老师"}</span>
                          <span className="opacity-50 text-[10px]">{new Date(msg.created_at).toLocaleString("zh-CN")}</span>
                          {hasCode && (
                            <button onClick={() => handleViewCode(msg.content, new Date(msg.created_at).toLocaleString("zh-CN"))}
                              className="ml-auto bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-medium transition">
                              &lt;/&gt; 查看代码
                            </button>
                          )}
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{displayContent}</p>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedStudent && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-800">📝 学生反馈记录</h3>
            </div>
            {loadingReflections ? (
              <p className="text-sm text-gray-400 text-center py-4">加载中...</p>
            ) : reflections.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">该学生暂无反馈记录</p>
            ) : (
              <div className="space-y-3">
                {reflections.map((conv: any) => {
                  let refData: any = null;
                  try { refData = typeof conv.reflection === "string" ? JSON.parse(conv.reflection) : conv.reflection; } catch {}
                  if (!refData) return null;
                  return (
                    <div key={conv.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">📝 {conv.title}</span>
                        <span className="text-xs text-gray-400">{new Date(conv.updated_at).toLocaleString("zh-CN")}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {refData.card1 && (<div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100"><p className="text-gray-400 mb-1">📷 我的游戏</p><p className="text-gray-700">{refData.card1}</p></div>)}
                        {refData.card2 && (<div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100"><p className="text-gray-400 mb-1">⭐ 最骄傲</p><p className="text-gray-700">{refData.card2}</p></div>)}
                        {refData.card3 && (<div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100"><p className="text-gray-400 mb-1">🚀 下次想</p><p className="text-gray-700">{refData.card3}</p></div>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {codeModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setCodeModal({ open: false, code: "", time: "" })}>
            <div className="bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
                <div><span className="text-white font-medium text-sm">📄 游戏代码</span><span className="text-gray-400 text-xs ml-3">{codeModal.time}</span></div>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(codeModal.code); alert("已复制到剪贴板"); }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs transition">📋 复制</button>
                  <button onClick={() => setCodeModal({ open: false, code: "", time: "" })}
                    className="text-gray-400 hover:text-white text-lg leading-none px-2 transition">✕</button>
                </div>
              </div>
              <div className="overflow-y-auto p-5">
                <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">{codeModal.code}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 作品审核 ====================
function ProjectsReview() {
  // 树导航状态
  const [selectedNode, setSelectedNode] = useState<TreeNode>({ type: "all", label: "全部作品" });
  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set());
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});

  // 作品数据状态
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // 获取统计（用于树节点计数）
  const fetchCounts = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/admin/students", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: any[] = await res.json();
        const counts: Record<string, number> = { all: data.length };
        data.forEach((s: any) => {
          if (s.grade) counts[`g${s.grade}`] = (counts[`g${s.grade}`] || 0) + 1;
          if (s.grade && s.class_num) counts[`g${s.grade}_c${s.class_num}`] = (counts[`g${s.grade}_c${s.class_num}`] || 0) + 1;
        });
        setClassCounts(counts);
      }
    } catch (err) { console.error("获取统计失败:", err); }
  }, []);

  // 获取作品列表
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) { setLoading(false); return; }
      const params = new URLSearchParams();
      if (selectedNode.type === "grade" && selectedNode.grade) params.set("grade", String(selectedNode.grade));
      if (selectedNode.type === "class" && selectedNode.grade) params.set("grade", String(selectedNode.grade));
      if (selectedNode.type === "class" && selectedNode.classNum) params.set("class_num", String(selectedNode.classNum));
      const res = await fetch(`/api/admin/projects?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setProjects(data || []);
      }
    } catch (err) { console.error("获取作品列表失败:", err); }
    finally { setLoading(false); }
  }, [selectedNode]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // 树操作
  const toggleGrade = (g: number) => {
    const next = new Set(expandedGrades);
    if (next.has(g)) next.delete(g); else next.add(g);
    setExpandedGrades(next);
  };

  const selectNode = (node: TreeNode) => {
    setSelectedNode(node);
    setSelectedIds(new Set());
  };

  // 选择操作
  const toggleSelectAll = () => {
    if (selectedIds.size === projects.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(projects.map((p: any) => p.id)));
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const batchDownload = () => {
    projects.filter((p: any) => selectedIds.has(p.id)).forEach((p: any) => downloadHtml(p.html_code, p.game_title));
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个作品吗？`)) return;
    setDeleting(true);
    try {
      const token = await getAuthToken();
      await Promise.all(Array.from(selectedIds).map((id) =>
        fetch("/api/admin/projects", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id }),
        })
      ));
      setSelectedIds(new Set());
      fetchProjects();
    } catch (err) { alert("删除失败，请重试"); }
    finally { setDeleting(false); }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-160px)] min-h-[500px]">
      {/* 左侧树导航 */}
      <div className="w-56 bg-white rounded-2xl shadow-md border border-gray-100 overflow-y-auto shrink-0 p-3">
        <div
          onClick={() => selectNode({ type: "all", label: "全部作品" })}
          className={`px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium transition mb-1 flex items-center justify-between ${
            selectedNode.type === "all" ? "bg-indigo-600 text-white shadow-md" : "text-gray-700 hover:bg-indigo-50"
          }`}
        >
          <span>📋 全部作品</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${selectedNode.type === "all" ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
            {classCounts.all || 0}
          </span>
        </div>
        <div className="border-t border-gray-100 my-2" />
        {GRADES.map((g) => {
          const isExpanded = expandedGrades.has(g.value);
          const gCount = classCounts[`g${g.value}`] || 0;
          return (
            <div key={g.value}>
              <div
                onClick={() => { selectNode({ type: "grade", grade: g.value, label: g.label }); toggleGrade(g.value); }}
                className={`px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition flex items-center justify-between ${
                  selectedNode.type === "grade" && selectedNode.grade === g.value ? "bg-indigo-100 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className={`inline-block transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                  {g.label}
                </span>
                <span className="text-xs text-gray-400">{gCount}</span>
              </div>
              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => {
                    const cCount = classCounts[`g${g.value}_c${c}`] || 0;
                    const isSelected = selectedNode.type === "class" && selectedNode.grade === g.value && selectedNode.classNum === c;
                    return (
                      <div key={c}
                        onClick={() => selectNode({ type: "class", grade: g.value, classNum: c, label: `${g.label} ${c}班` })}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm transition flex items-center justify-between ${
                          isSelected ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{c}班</span>
                        {cCount > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20" : "bg-gray-100 text-gray-400"}`}>
                            {cCount}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 右侧作品面板 */}
      <div className="flex-1 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-gray-800">
            {selectedNode.label}
            <span className="text-sm font-normal text-gray-400 ml-2">({projects.length} 个作品)</span>
          </h2>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">已选 {selectedIds.size} 项</span>
              <button onClick={batchDownload} className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition">
                ⬇️ 批量下载
              </button>
              <button onClick={batchDelete} disabled={deleting} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                {deleting ? "删除中..." : "🗑️ 批量删除"}
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1">
                取消选择
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <span className="animate-pulse text-sm">加载中...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-4xl mb-2">🎨</p>
              <p className="text-sm">暂无作品数据</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-3 w-10">
                    <input type="checkbox" checked={projects.length > 0 && selectedIds.size === projects.length}
                      onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer" />
                  </th>
                  <th className="py-3 px-4 font-semibold text-gray-700">游戏名称</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">作者</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">年级</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">班级</th>
                  <th className="py-3 px-4 font-semibold text-gray-700">上传时间</th>
                  <th className="py-3 px-4 font-semibold text-gray-700 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p: any) => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-indigo-50/50 transition ${selectedIds.has(p.id) ? "bg-indigo-50" : ""}`}>
                    <td className="py-2.5 px-3">
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer" />
                    </td>
                    <td className="py-2.5 px-4 font-medium truncate max-w-[200px]" title={p.game_title}>🎮 {p.game_title}</td>
                    <td className="py-2.5 px-4 text-gray-600 text-sm">{p.users?.name || "未知"} ({p.users?.student_id || "-"})</td>
                    <td className="py-2.5 px-4 text-gray-500 text-sm">{p.users?.grade ? gradeLabel(p.users.grade) : "-"}</td>
                    <td className="py-2.5 px-4 text-gray-500 text-sm">{p.users?.class_num ? `${p.users.class_num}班` : "-"}</td>
                    <td className="py-2.5 px-4 text-gray-400 text-xs">
                      {new Date(p.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setSelectedProject(p)} className="text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded text-xs transition">👀 预览</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => downloadHtml(p.html_code, p.game_title)} className="text-green-600 hover:text-green-800 px-2 py-1 rounded text-xs transition">⬇️ 下载</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
                <button onClick={() => downloadHtml(selectedProject.html_code, selectedProject.game_title)}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">⬇️ 下载</button>
                <button onClick={() => setSelectedProject(null)}
                  className="text-gray-400 hover:text-gray-800 text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition">✕</button>
              </div>
            </div>
            <div className="flex-1 p-4 bg-gray-900 rounded-b-2xl">
              <iframe srcDoc={selectedProject.html_code} title={selectedProject.game_title}
                className="w-full h-full rounded-xl bg-white" sandbox="allow-scripts" scrolling="no" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 学生分类评估查看
// ============================================================
function ClassificationsView() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch("/api/admin/classifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error("获取分类数据失败:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const lowSrlCount = data.filter((d) => d.srl_group === "low_srl").length;
  const highSrlCount = data.filter((d) => d.srl_group === "high_srl").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">📊 学生分类评估</h2>
        <button
          onClick={() => {
            const rows = data.map((d) => ({
              "学生姓名": d.student_name,
              "学号": d.student_id,
              "年级": d.grade ? `${d.grade}年级` : "",
              "班级": d.class_num ? `${d.class_num}班` : "",
              "Q1答案": Array.isArray(d.q1_answers) ? d.q1_answers.join("；") : d.q1_answers,
              "Q1得分": d.q1_score,
              "Q2答案": d.q2_answer || "",
              "Q2得分": d.q2_score,
              "Q3答案": d.q3_answer || "",
              "Q3得分": d.q3_score,
              "总分": d.total_score,
              "分组": d.srl_group === "high_srl" ? "高SRL" : "低SRL",
              "耗时(秒)": d.total_time,
              "提交时间": d.created_at ? new Date(d.created_at).toLocaleString("zh-CN") : "",
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws["!cols"] = [
              { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 6 },
              { wch: 40 }, { wch: 6 },
              { wch: 40 }, { wch: 6 },
              { wch: 40 }, { wch: 6 },
              { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 16 },
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "学生分类");
            XLSX.writeFile(wb, `学生分类评估_${new Date().toISOString().slice(0, 10)}.xlsx`);
          }}
          disabled={data.length === 0}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          📊 导出Excel
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{data.length}</p>
          <p className="text-sm text-gray-500 mt-1">已评估</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{lowSrlCount}</p>
          <p className="text-sm text-amber-700 mt-1">低设计SRL组</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{highSrlCount}</p>
          <p className="text-sm text-green-700 mt-1">高设计SRL组</p>
        </div>
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 text-center">
          <p className="text-base font-medium text-indigo-600">
            低SRL: 直接生成式<br />高SRL: 苏格拉底式
          </p>
          <p className="text-xs text-indigo-400 mt-1">AI教学模式</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">加载中...</p>
      ) : data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">暂无评估数据</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">学生</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">年级</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">班级</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">Q1观察</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">Q2评价</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">Q3推理</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">总分</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">分组</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">耗时</th>
                <th className="py-3 px-4 font-semibold text-gray-700 text-sm">时间</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-gray-800">{d.student_name}</p>
                    <p className="text-xs text-gray-400">{d.student_id}</p>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{d.grade ? `${d.grade}年级` : "-"}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{d.class_num ? `${d.class_num}班` : "-"}</td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-medium ${d.q1_score >= 2 ? "text-green-600" : d.q1_score === 1 ? "text-amber-600" : "text-red-500"}`}>
                      {d.q1_score}/2
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-medium ${d.q2_score >= 2 ? "text-green-600" : d.q2_score === 1 ? "text-amber-600" : "text-red-500"}`}>
                      {d.q2_score}/2
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-medium ${d.q3_score >= 2 ? "text-green-600" : d.q3_score === 1 ? "text-amber-600" : "text-red-500"}`}>
                      {d.q3_score}/2
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-bold ${d.total_score >= 4 ? "text-green-600" : "text-amber-600"}`}>
                      {d.total_score}/6
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      d.srl_group === "high_srl"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {d.srl_group === "high_srl" ? "高SRL" : "低SRL"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">{d.total_time}秒</td>
                  <td className="py-3 px-4 text-xs text-gray-400">
                    {new Date(d.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 反思卡片小组件（P3-9）
// ============================================================
function ReflectionCard({ reflectionJson }: { reflectionJson: string }) {
  try {
    const data = JSON.parse(reflectionJson);
    if (!data.card1 && !data.card2 && !data.card3) return null;

    return (
      <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
        <p className="text-xs font-bold text-amber-700">🎉 学生反思</p>
        {data.card1 && (
          <div className="text-xs bg-white p-2 rounded-lg border border-amber-100">
            <span className="text-gray-400">📷 我的游戏：</span>
            <span className="text-gray-700 ml-1">{data.card1}</span>
          </div>
        )}
        {data.card2 && (
          <div className="text-xs bg-white p-2 rounded-lg border border-amber-100">
            <span className="text-gray-400">⭐ 最骄傲：</span>
            <span className="text-gray-700 ml-1">{data.card2}</span>
          </div>
        )}
        {data.card3 && (
          <div className="text-xs bg-white p-2 rounded-lg border border-amber-100">
            <span className="text-gray-400">🚀 下次想：</span>
            <span className="text-gray-700 ml-1">{data.card3}</span>
          </div>
        )}
      </div>
    );
  } catch {
    return null;
  }
}
