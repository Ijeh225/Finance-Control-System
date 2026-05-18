import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";

export function useNotificationStream(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const basePath = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
    const url = `${basePath}/api/notifications/stream`;

    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ userId }) });
    };

    return () => {
      es.close();
    };
  }, [userId, qc]);
}
