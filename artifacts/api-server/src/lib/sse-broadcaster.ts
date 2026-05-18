import type { Response } from "express";

const clients = new Map<string, Set<Response>>();

export function subscribe(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function unsubscribe(userId: string, res: Response): void {
  clients.get(userId)?.delete(res);
  if (clients.get(userId)?.size === 0) clients.delete(userId);
}

export function publish(userId: string, data: Record<string, unknown>): void {
  const subs = clients.get(userId);
  if (!subs || subs.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try {
      res.write(payload);
    } catch {
      subs.delete(res);
    }
  }
}
