import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@fincommand/upload_queue';

export type QueuedUpload = {
  id: string;
  billId: string;
  fileName: string;
  fileUri: string;
  mimeType: string;
  fileSize: number | null;
  queuedAt: string;
};

export async function loadQueue(): Promise<QueuedUpload[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedUpload[];
  } catch {
    return [];
  }
}

export async function saveQueue(items: QueuedUpload[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

export async function pushToQueue(
  item: Omit<QueuedUpload, 'id' | 'queuedAt'>,
): Promise<QueuedUpload> {
  const queue = await loadQueue();
  const newItem: QueuedUpload = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    queuedAt: new Date().toISOString(),
  };
  await saveQueue([...queue, newItem]);
  return newItem;
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((item) => item.id !== id));
}
