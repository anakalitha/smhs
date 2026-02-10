// src\components\notifications\NotificationsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type NotificationDTO = {
  id: number;
  title: string;
  body: string | null;
  severity: "info" | "task" | "critical";
  priority: "low" | "normal" | "high" | "critical";
  status: "unread" | "read" | "acted";
  route: string | null;
  actionLabel: string | null;
  createdAt: string; // ISO
};

function timeAgo(iso: string) {
  const dt = new Date(iso).getTime();
  const diff = Date.now() - dt;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function NotificationsPanel() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  async function load() {
    try {
      const [countRes, listRes] = await Promise.all([
        fetch("/api/notifications/unread-count", { cache: "no-store" }),
        fetch("/api/notifications?status=unread&limit=20", {
          cache: "no-store",
        }),
      ]);

      if (countRes.ok) {
        const c = await countRes.json();
        setUnreadCount(c.unread ?? 0);
      }

      if (listRes.ok) {
        const data = await listRes.json();
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    // Optimistic update
    setItems((prev) => prev.filter((x) => x.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  const header = useMemo(() => {
    return (
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Notifications</div>
        <div className="text-xs rounded-full px-2 py-0.5 bg-gray-100">
          {unreadCount} unread
        </div>
      </div>
    );
  }, [unreadCount]);

  useEffect(() => {
    load();

    // Poll every 20s (OK for now)
    const t = setInterval(load, 20000);

    // Also refresh when tab becomes active again
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="rounded-lg border bg-white">
      <div className="p-3 border-b">{header}</div>

      <div className="p-3">
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-500">No unread notifications.</div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <div
                key={n.id}
                className="rounded-md border p-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body ? (
                      <div className="text-xs text-gray-600 mt-1 line-clamp-3">
                        {n.body}
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-400 mt-2">
                      {n.severity.toUpperCase()} • {timeAgo(n.createdAt)}
                    </div>
                  </div>

                  <button
                    className="text-xs px-2 py-1 rounded border hover:bg-white bg-gray-100"
                    onClick={() => markRead(n.id)}
                    title="Mark as read"
                  >
                    Read
                  </button>
                </div>

                {/* Optional action: navigate */}
                {n.route ? (
                  <div className="mt-2">
                    <button
                      className="text-xs px-2 py-1 rounded bg-black text-white"
                      onClick={async () => {
                        await markRead(n.id);
                        router.push(n.route!);
                      }}
                    >
                      {n.actionLabel || "Open"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
