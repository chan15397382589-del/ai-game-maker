"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/components/SupabaseProvider";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // 直接跳转到登录页，由登录页处理 session 检查
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="text-center">
        <p className="text-lg text-gray-500 animate-pulse">正在跳转...</p>
      </div>
    </div>
  );
}
