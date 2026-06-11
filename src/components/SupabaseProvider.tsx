"use client";

import { useEffect, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Session } from "@supabase/supabase-js";

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

export default function SupabaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const client = getSupabase();

    client.auth.getSession().then(({ data: { session } }) => {
      if (!session) clearSupabaseStorage();
    }).catch(() => clearSupabaseStorage());

    const { data: { subscription } } = client.auth.onAuthStateChange(() => {});
    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}

function clearSupabaseStorage() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("sb-") || key.startsWith("supabase."))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
