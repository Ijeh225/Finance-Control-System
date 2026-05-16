import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  requestBillAttachmentUpload,
  confirmBillAttachment,
} from '@workspace/api-client-react';
import {
  loadQueue,
  pushToQueue,
  removeFromQueue,
  type QueuedUpload,
} from '@/lib/uploadQueue';

type UploadQueueContextType = {
  queue: QueuedUpload[];
  enqueue: (item: Omit<QueuedUpload, 'id' | 'queuedAt'>) => Promise<QueuedUpload>;
  isDraining: boolean;
};

const UploadQueueContext = createContext<UploadQueueContextType | undefined>(undefined);

/**
 * Returns true if the error is worth retrying (network/5xx), false if it is a
 * permanent failure (4xx validation/auth/not-found) that should be removed from
 * the queue rather than retried indefinitely.
 */
export function isRetryableUploadError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    return status >= 500;
  }
  if (err instanceof Error) {
    const match = err.message.match(/Storage upload failed: (\d+)/);
    if (match) {
      const status = parseInt(match[1], 10);
      return status >= 500;
    }
  }
  return true;
}

async function performUpload(item: QueuedUpload): Promise<void> {
  const { attachmentId, uploadUrl } = await requestBillAttachmentUpload(item.billId, {
    fileName: item.fileName,
    mimeType: item.mimeType,
    fileSize: item.fileSize ?? undefined,
  });

  const fileRes = await fetch(item.fileUri);
  const blob = await fileRes.blob();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', item.mimeType);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });

  await confirmBillAttachment(item.billId, attachmentId);
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [isDraining, setIsDraining] = useState(false);
  const drainingRef = useRef(false);

  useEffect(() => {
    loadQueue().then(setQueue);
  }, []);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    const current = await loadQueue();
    if (current.length === 0) return;

    drainingRef.current = true;
    setIsDraining(true);

    for (const item of current) {
      try {
        await performUpload(item);
        await removeFromQueue(item.id);
        setQueue((prev) => prev.filter((q) => q.id !== item.id));
      } catch (err) {
        if (!isRetryableUploadError(err)) {
          // Permanent failure (4xx) — remove so it doesn't loop forever
          await removeFromQueue(item.id);
          setQueue((prev) => prev.filter((q) => q.id !== item.id));
        }
        // Retryable failures leave the item in queue for next network event
      }
    }

    drainingRef.current = false;
    setIsDraining(false);
  }, []);

  // Drain when network connectivity is restored
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        drainQueue();
      }
    });
    return unsubscribe;
  }, [drainQueue]);

  // Also drain when the app comes back to the foreground (connectivity may not
  // have changed but a previous drain attempt may have stalled)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        drainQueue();
      }
    });
    return () => sub.remove();
  }, [drainQueue]);

  const enqueue = useCallback(
    async (item: Omit<QueuedUpload, 'id' | 'queuedAt'>) => {
      const newItem = await pushToQueue(item);
      setQueue((prev) => [...prev, newItem]);
      return newItem;
    },
    [],
  );

  return (
    <UploadQueueContext.Provider value={{ queue, enqueue, isDraining }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue(): UploadQueueContextType {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error('useUploadQueue must be used inside UploadQueueProvider');
  return ctx;
}
