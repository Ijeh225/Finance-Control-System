import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const WIPE_TOKEN = "FC_WIPE_2026_ONE_TIME";

router.post("/admin/wipe", async (req, res) => {
  const { token } = req.body as { token?: string };
  if (token !== WIPE_TOKEN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    await db.execute(sql`
      TRUNCATE audit_entries, bill_attachments, comments, notifications,
        sessions, wallet_transactions, wallets, bills, vendors CASCADE
    `);
    await db.execute(sql`DELETE FROM users WHERE email != 'md@fincommand.ng'`);

    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM users)               AS users,
        (SELECT COUNT(*) FROM bills)               AS bills,
        (SELECT COUNT(*) FROM vendors)             AS vendors,
        (SELECT COUNT(*) FROM wallets)             AS wallets,
        (SELECT COUNT(*) FROM notifications)       AS notifications
    `);

    res.json({ ok: true, counts: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
