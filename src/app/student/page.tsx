"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";
import ModuleIdeation from "@/components/ModuleIdeation";
import ModuleCreate from "@/components/ModuleCreate";
import ModuleShowcase from "@/components/ModuleShowcase";
import ModuleReflection from "@/components/ModuleReflection";

const MODULES = [
  { id: "ideation", label: "  游戏构思", desc: "设计你的游戏" },
  { id: "create", label: "  游戏设计", desc: "和小智老师一起创作" },
  { id: "showcase", label: "  作品展示", desc: "展示和评价作品" },
  { id: "reflection", label: "  我的反思", desc: "回顾创作过程" },
];

export default function StudentPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [activeModule, setActiveModule] = useState("ideation");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }
        setUserId(session.user.id);
        const { data: userData } = await supabase.from("users").select("name, role").eq("id", session.user.id).single();
        if (userData?.role === "admin") { router.push("/admin"); return; }
        setUserName(userData?.name || "");
        // 检查 URL 参数或 localStorage，支持从其他页面跳转到指定模块
        const params = new URLSearchParams(window.location.search);
        const moduleParam = params.get("module") || localStorage.getItem("gotoModule");
        if (moduleParam && ["ideation", "create", "showcase", "reflection"].includes(moduleParam)) {
          setActiveModule(moduleParam);
          localStorage.removeItem("gotoModule");
        }
        setReady(true);
      } catch {
        router.push("/login");
      }
    };
    checkAuth();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <p className="text-gray-500 text-lg animate-pulse">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* 顶部导航栏 */}
      <nav className="bg-indigo-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl"> </span>
            <h1 className="text-xl font-bold">AI 游戏创作课堂</h1>
            <span className="text-sm text-indigo-200 ml-2">欢迎，{userName}</span>
          </div>
          <div className="flex items-center gap-2">
            {MODULES.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeModule === m.id
                    ? "bg-white text-indigo-600 shadow-md"
                    : "text-white/80 hover:bg-white/20"
                }`}
              >
                {m.label}
              </button>
            ))}
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login?action=switch"); }}
              className="ml-4 text-sm bg-indigo-500 hover:bg-indigo-400 px-3 py-2 rounded-lg transition"
            >
              退出
            </button>
          </div>
        </div>
      </nav>

      {/* 模块内容 - 所有模块保持挂载，用CSS显示/隐藏 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div style={{ display: activeModule === "ideation" ? "block" : "none" }}>
          <ModuleIdeation userId={userId} />
        </div>
        <div style={{ display: activeModule === "create" ? "block" : "none" }}>
          <ModuleCreate userId={userId} />
        </div>
        <div style={{ display: activeModule === "showcase" ? "block" : "none" }}>
          <ModuleShowcase userId={userId} />
        </div>
        <div style={{ display: activeModule === "reflection" ? "block" : "none" }}>
          <ModuleReflection userId={userId} />
        </div>
      </div>
    </div>
  );
}
