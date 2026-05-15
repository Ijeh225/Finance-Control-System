import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditTable = pgTable("audit_entries", {
  id: text("id").primaryKey(),
  billId: text("bill_id"),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditSchema = createInsertSchema(auditTable).omit({ createdAt: true });
export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type AuditEntry = typeof auditTable.$inferSelect;
