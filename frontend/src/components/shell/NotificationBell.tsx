"use client";

import Link from "next/link";
import { Icon } from "@/components/ui";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { href } from "@/lib/access";

export function NotificationBell() {
  const unread = useUnreadNotifications();
  return (
    <Link
      className={`btn btn-round ghost notification${unread ? "" : " no-unread"}`}
      href={href("notifications")}
      aria-label={unread ? `${unread} notifikasi baru` : "Notifikasi"}
    >
      <Icon name="bell" />
      {unread ? (
        <span className="notification-count" aria-hidden="true">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
