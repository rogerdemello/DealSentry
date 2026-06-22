import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notificationsApi } from "@/lib/api-client";
import { formatIST } from "@/lib/utils";

const LAST_SEEN_KEY = "notifications:lastSeenAt";
const POLL_MS = 30_000;

export default function NotificationBell() {
  const [lastSeen, setLastSeen] = useState<string | undefined>(
    () => localStorage.getItem(LAST_SEEN_KEY) || undefined
  );
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications", lastSeen],
    queryFn: () => notificationsApi.get(lastSeen),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Opening the feed marks everything currently visible as seen.
    if (next) {
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SEEN_KEY, now);
      setLastSeen(now);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-md bg-card/95 backdrop-blur-sm border border-border/60 shadow-sm hover:shadow-md hover:bg-muted/50 transition-all duration-200 text-foreground hover:text-primary"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border/60">
          <h3 className="font-heading text-sm font-semibold text-foreground">Activity</h3>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No recent activity.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/40">
                <p className="text-[13px] text-foreground leading-snug">
                  {item.action}
                  {item.proposal?.title ? (
                    <span className="text-muted-foreground"> · {item.proposal.title}</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {item.actor?.name || item.actor?.email || "Someone"} ·{" "}
                  {formatIST(item.timestamp, "MMM d, h:mm a")}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
