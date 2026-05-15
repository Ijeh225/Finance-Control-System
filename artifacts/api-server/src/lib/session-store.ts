import { Store, type SessionData } from "express-session";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

export class DrizzleSessionStore extends Store {
  private pruneInterval: ReturnType<typeof setInterval>;

  constructor() {
    super();
    this.pruneInterval = setInterval(
      () => this.prune(),
      60 * 60 * 1000, // prune expired sessions every hour
    );
    if (this.pruneInterval.unref) this.pruneInterval.unref();
  }

  private async prune() {
    try {
      await db.delete(sessionsTable).where(lt(sessionsTable.expire, new Date()));
    } catch {
      // silent
    }
  }

  get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void,
  ) {
    db.select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sid, sid))
      .then(rows => {
        if (!rows.length) return callback(null, null);
        const row = rows[0];
        if (new Date(row.expire) < new Date()) {
          this.destroy(sid, () => callback(null, null));
          return;
        }
        callback(null, row.sess as SessionData);
      })
      .catch(err => callback(err));
  }

  set(
    sid: string,
    session: SessionData,
    callback?: (err?: unknown) => void,
  ) {
    const maxAge = session.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
    const expire = new Date(Date.now() + maxAge);
    db.insert(sessionsTable)
      .values({ sid, sess: session, expire })
      .onConflictDoUpdate({
        target: sessionsTable.sid,
        set: { sess: session, expire },
      })
      .then(() => callback?.())
      .catch(err => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    db.delete(sessionsTable)
      .where(eq(sessionsTable.sid, sid))
      .then(() => callback?.())
      .catch(err => callback?.(err));
  }
}
