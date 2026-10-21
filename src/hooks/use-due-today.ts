"use client";

import { useEffect, useState } from "react";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { toDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export function useDueTodayCount(): number {
  const { user, adminUid } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || !adminUid) {
      setCount(0);
      return;
    }
    const unsub = subscribeToTasks(adminUid, (tasks) => {
      const now = Date.now();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextDay = new Date(today);
      nextDay.setDate(nextDay.getDate() + 1);
      let n = 0;
      for (const t of tasks) {
        if (t.completed) continue;
        const d = toDate(t.dueAt);
        if (!d) continue;
        // overdue or due today
        if (d.getTime() < nextDay.getTime() || d.getTime() < now) {
          n += 1;
        }
      }
      setCount(n);
    });
    return () => unsub();
  }, [user, adminUid]);

  return count;
}
