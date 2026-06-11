"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Session } from "@supabase/supabase-js";

// 运行时环境变量（Next.js 会在构建时内联 NEXT_PUBLIC_* 变量）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 直接创建客户端（构建时使用占位符，运行时使用真实值）
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

export default function SupabaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // 尝试恢复 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
      } else {
        // session 无效才清除
        clearSupabaseStorage();
      }
    }).catch(() => {
      // 出错时清除
      clearSupabaseStorage();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}

// 清除 Supabase 存储在 localStorage 中的过期 session
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
