"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/components/SupabaseProvider";
import { useRouter } from "next/navigation";

interface Props {
  userId: string;
}

export default function ModuleShowcase({ userId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/reviews", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setItems(await res.json());
      } catch {}
      finally { setLoading(false); }
    };
    fetchItems();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">  作品展示墙</h2>
        <button
          onClick={() => router.push("/student/reviews")}
          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition"
        >查看全部 →</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 animate-pulse">加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-6xl mb-4"> </p>
          <p>还没有作品，快去创作吧！</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {items.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition"
              onClick={() => router.push(`/student/reviews/${item.id}`)}
            >
              <div className="aspect-square bg-gray-50 relative overflow-hidden">
                <iframe srcDoc={item.html_code} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" loading="lazy" scrolling="no" />
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-bold text-gray-800 truncate">{item.author_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{item.liked_by_me ? "❤️" : "🤍"} {item.like_count}</span>
                  <span className="text-xs text-gray-400">💬 {item.comment_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
