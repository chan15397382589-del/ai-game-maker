"use client";

import { useEffect } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 单例客户端（延迟初始化）
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: {
          headers: { "x-my-app": "ai-game-classroom" },
        },
      }
    );
  }
  return _client;
}

// 直接导出客户端实例（首次访问时才创建）
export const supabase: SupabaseClient = typeof window !== "undefined"
  ? getSupabase()
  : createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

// 清除 Supabase 存储在 localStorage 中的过期 session
function clearSupabaseStorage() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.startsWith("supabase."))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage 可能不可用
  }
}

export default function SupabaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const client = getSupabase();

    // 尝试恢复 session
    client.auth.getSession().then(({ error }) => {
      if (error) {
        console.warn("[Supabase] Session 恢复失败:", error.message);
        clearSupabaseStorage();
      }
    }).catch(() => clearSupabaseStorage());

    const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
