import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { walletsTable } from "./wallets";
import { usersTable } from "./users";

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["credit", "debit", "transfer_in", "transfer_out"] }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 15, scale: 2 }).notNull(),
  narration: text("narration").notNull(),
  initiatedBy: text("initiated_by").notNull().references(() => usersTable.id),
  initiatedByName: text("initiated_by_name").notNull(),
  relatedWalletId: text("related_wallet_id").references(() => walletsTable.id, { onDelete: "set null" }),
  relatedWalletName: text("related_wallet_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactionsTable).omit({ createdAt: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
