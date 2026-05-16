import { pgTable, text, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const billsTable = pgTable("bills", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 15, scale: 2 }),
  paidAmount: numeric("paid_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  scheduledDate: text("scheduled_date").notNull(),
  dueDate: text("due_date"),
  walletId: text("wallet_id"),
  walletName: text("wallet_name"),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).notNull().default("medium"),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "on_hold", "partial", "paid", "overdue"],
  }).notNull().default("pending"),
  createdBy: text("created_by").notNull(),
  createdByName: text("created_by_name").notNull(),
  hasAttachment: boolean("has_attachment").notNull().default(false),
  overdueDays: integer("overdue_days").notNull().default(0),
  // Payment processing fields (set when PA calls /pay)
  paidBy: text("paid_by"),
  paidByName: text("paid_by_name"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentReference: text("payment_reference"),
  paidWalletId: text("paid_wallet_id"),
  paidWalletName: text("paid_wallet_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBillSchema = createInsertSchema(billsTable).omit({
  createdAt: true,
  updatedAt: true,
  paidAmount: true,
  outstandingBalance: true,
  overdueDays: true,
  paidBy: true,
  paidByName: true,
  paidAt: true,
  paymentReference: true,
  paidWalletId: true,
  paidWalletName: true,
});
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof billsTable.$inferSelect;
