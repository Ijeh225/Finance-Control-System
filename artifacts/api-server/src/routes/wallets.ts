import { Router, type IRouter } from "express";
import { eq, desc, sql, or } from "drizzle-orm";
import { db, walletsTable, usersTable, walletTransactionsTable, auditTable } from "@workspace/db";

const router: IRouter = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function fmtWallet(w: typeof walletsTable.$inferSelect, ownerName?: string) {
  return {
    ...w,
    balance: parseFloat(String(w.balance ?? 0)),
    ownedByName: ownerName,
  };
}

function fmtTx(tx: typeof walletTransactionsTable.$inferSelect) {
  return {
    ...tx,
    amount: parseFloat(String(tx.amount)),
    balanceBefore: parseFloat(String(tx.balanceBefore)),
    balanceAfter: parseFloat(String(tx.balanceAfter)),
  };
}

// GET /wallets — list wallets, scoped by role
router.get("/wallets", async (req, res): Promise<void> => {
  const actor = req.user!;
  const requestedUserId = req.query["userId"] as string | undefined;

  const ownedBy = actor.role !== "md"
    ? actor.id
    : requestedUserId ?? undefined;

  const wallets = ownedBy
    ? await db.select().from(walletsTable).where(eq(walletsTable.ownedBy, ownedBy))
    : await db.select().from(walletsTable);

  const ownerIds = [...new Set(wallets.map(w => w.ownedBy).filter(Boolean))] as string[];
  const owners = ownerIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const ownerMap: Record<string, string> = Object.fromEntries(owners.map(o => [o.id, o.name]));

  res.json({ wallets: wallets.map(w => fmtWallet(w, w.ownedBy ? ownerMap[w.ownedBy] : undefined)) });
});

// POST /wallets — create wallet (MD only or self)
router.post("/wallets", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { name, bankName, accountNumber, balance, currency, ownedBy: bodyOwnedBy } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const ownedBy = actor.role === "md" && bodyOwnedBy ? bodyOwnedBy : actor.id;

  const [wallet] = await db.insert(walletsTable).values({
    id: uid(),
    name,
    bankName: bankName ?? null,
    accountNumber: accountNumber ?? null,
    balance: String(balance ?? 0),
    currency: currency ?? "NGN",
    ownedBy,
  }).returning();

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.status(201).json(fmtWallet(wallet, ownerName));
});

// POST /wallets/transfer — atomic transfer between wallets
// Uses SELECT … FOR UPDATE (ordered by id to prevent deadlock) so concurrent
// transfers against the same wallets serialise correctly and cannot overdraw.
router.post("/wallets/transfer", async (req, res): Promise<void> => {
  const actor = req.user!;
  const { fromWalletId, toWalletId, amount, narration } = req.body;

  // Pure input validation — no DB reads yet
  if (!fromWalletId || !toWalletId || amount === undefined || !narration) {
    res.status(400).json({ error: "fromWalletId, toWalletId, amount, and narration are required" });
    return;
  }
  if (fromWalletId === toWalletId) {
    res.status(400).json({ error: "Source and destination wallets must be different" });
    return;
  }
  const transferAmount = parseFloat(String(amount));
  if (isNaN(transferAmount) || transferAmount <= 0) {
    res.status(400).json({ error: "Amount must be a positive number" });
    return;
  }

  // Discriminated result from the transaction
  type TxResult =
    | { ok: true; from: typeof walletsTable.$inferSelect; to: typeof walletsTable.$inferSelect; debitTx: typeof walletTransactionsTable.$inferSelect; creditTx: typeof walletTransactionsTable.$inferSelect }
    | { ok: false; status: number; error: string };

  const result: TxResult = await db.transaction(async (tx) => {
    // Lock both rows with consistent ordering to prevent deadlocks
    const [first, second] = [fromWalletId, toWalletId].sort();
    const locked = await tx.execute<{ id: string; balance: string; ownedBy: string | null; name: string }>(
      sql`SELECT id, balance, owned_by AS "ownedBy", name FROM wallets WHERE id = ${first} OR id = ${second} ORDER BY id FOR UPDATE`
    );

    const fromWallet = locked.rows.find(r => r.id === fromWalletId);
    const toWallet   = locked.rows.find(r => r.id === toWalletId);

    if (!fromWallet) return { ok: false, status: 404, error: "Source wallet not found" };
    if (!toWallet)   return { ok: false, status: 404, error: "Destination wallet not found" };

    if (actor.role !== "md" && fromWallet.ownedBy !== actor.id) {
      return { ok: false, status: 403, error: "You can only transfer from your own wallet" };
    }

    // Non-MD: destination must also be a wallet the actor owns.
    // Prevents leaking metadata of unrelated wallets via the transfer response.
    if (actor.role !== "md" && toWallet.ownedBy !== actor.id) {
      return { ok: false, status: 403, error: "You can only transfer to your own wallet" };
    }

    const fromBalance = parseFloat(fromWallet.balance);
    const toBalance   = parseFloat(toWallet.balance);

    if (fromBalance < transferAmount) {
      return {
        ok: false,
        status: 400,
        error: `Insufficient balance. Available: ₦${fromBalance.toLocaleString("en-NG")}, Requested: ₦${transferAmount.toLocaleString("en-NG")}`,
      };
    }

    const newFromBalance = fromBalance - transferAmount;
    const newToBalance   = toBalance + transferAmount;

    const [updatedFrom] = await tx.update(walletsTable)
      .set({ balance: String(newFromBalance) })
      .where(eq(walletsTable.id, fromWalletId))
      .returning();

    const [updatedTo] = await tx.update(walletsTable)
      .set({ balance: String(newToBalance) })
      .where(eq(walletsTable.id, toWalletId))
      .returning();

    const [debitTx] = await tx.insert(walletTransactionsTable).values({
      id: uid(),
      walletId: fromWalletId,
      type: "transfer_out",
      amount: String(transferAmount),
      balanceBefore: String(fromBalance),
      balanceAfter: String(newFromBalance),
      narration,
      initiatedBy: actor.id,
      initiatedByName: actor.name,
      relatedWalletId: toWalletId,
      relatedWalletName: toWallet.name,
    }).returning();

    const [creditTx] = await tx.insert(walletTransactionsTable).values({
      id: uid(),
      walletId: toWalletId,
      type: "transfer_in",
      amount: String(transferAmount),
      balanceBefore: String(toBalance),
      balanceAfter: String(newToBalance),
      narration,
      initiatedBy: actor.id,
      initiatedByName: actor.name,
      relatedWalletId: fromWalletId,
      relatedWalletName: fromWallet.name,
    }).returning();

    // Audit insert is inside the transaction so it either commits with the
    // transfer or rolls back entirely — no partial-success risk.
    await tx.insert(auditTable).values({
      id: uid(),
      userId: actor.id,
      userName: actor.name,
      action: "transfer",
      details: `₦${transferAmount.toLocaleString("en-NG")} from ${fromWallet.name} → ${toWallet.name}: ${narration}`,
    });

    return { ok: true, from: updatedFrom, to: updatedTo, debitTx, creditTx };
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({
    from: fmtWallet(result.from),
    to: fmtWallet(result.to),
    debitTx: fmtTx(result.debitTx),
    creditTx: fmtTx(result.creditTx),
  });
});

// GET /wallets/:id — wallet detail with recent transactions
router.get("/wallets/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (actor.role !== "md" && wallet.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const recentTransactions = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(10);

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json({
    ...fmtWallet(wallet, ownerName),
    recentTransactions: recentTransactions.map(fmtTx),
  });
});

// GET /wallets/:id/statement — full paginated ledger
router.get("/wallets/:id/statement", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (actor.role !== "md" && wallet.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query["pageSize"] ?? "50")) || 50));
  const offset = (page - 1) * pageSize;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, id));

  const transactions = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json({
    wallet: fmtWallet(wallet, ownerName),
    transactions: transactions.map(fmtTx),
    total: count,
    page,
    pageSize,
  });
});

// PATCH /wallets/:id — update wallet; records a ledger entry if balance changes
router.patch("/wallets/:id", async (req, res): Promise<void> => {
  const actor = req.user!;
  const id = req.params["id"] as string;
  const { balance, name, bankName, accountNumber, currency, ownedBy } = req.body;

  const [existing] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Wallet not found" }); return; }

  if (actor.role !== "md" && existing.ownedBy !== actor.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (balance !== undefined) updates["balance"] = String(balance);
  if (name !== undefined) updates["name"] = name;
  if (bankName !== undefined) updates["bankName"] = bankName;
  if (accountNumber !== undefined) updates["accountNumber"] = accountNumber;
  if (currency !== undefined) updates["currency"] = currency;
  if (ownedBy !== undefined && actor.role === "md") updates["ownedBy"] = ownedBy;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [wallet] = await db.update(walletsTable).set(updates).where(eq(walletsTable.id, id)).returning();
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  // Record a ledger entry when the balance is manually adjusted
  if (balance !== undefined) {
    const prevBalance = parseFloat(String(existing.balance ?? 0));
    const newBalance  = parseFloat(String(balance));
    const diff = newBalance - prevBalance;
    if (diff !== 0) {
      await db.insert(walletTransactionsTable).values({
        id: uid(),
        walletId: id,
        type: diff > 0 ? "credit" : "debit",
        amount: String(Math.abs(diff)),
        balanceBefore: String(prevBalance),
        balanceAfter: String(newBalance),
        narration: "Manual balance adjustment",
        initiatedBy: actor.id,
        initiatedByName: actor.name,
        relatedWalletId: null,
        relatedWalletName: null,
      });
    }
  }

  let ownerName: string | undefined;
  if (wallet.ownedBy) {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, wallet.ownedBy));
    ownerName = owner?.name;
  }

  res.json(fmtWallet(wallet, ownerName));
});

export default router;
