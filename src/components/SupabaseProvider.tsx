"use client";

import { useEffect } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 懒加载：首次访问时才读取环境变量并创建客户端
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error("[Supabase] 环境变量缺失，无法初始化客户端");
    }
    _client = createClient(url || "", key || "");
  }
  return _client;
}

// 兼容旧代码的导出
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

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

    // 尝试恢复 session，如果失败则清除过期的 token
    client.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Refresh Token 过期等错误，清除本地存储
        console.warn("[Supabase] Session 恢复失败，清除本地存储:", error.message);
        clearSupabaseStorage();
      }
    }).catch((err) => {
      console.warn("[Supabase] Session 恢复异常:", err.message);
      clearSupabaseStorage();
    });

    // 监听认证状态变化
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      // 当 token 刷新失败时，清除本地存储
      if (event === "TOKEN_REFRESHED") {
        // token 刷新成功，无需处理
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
