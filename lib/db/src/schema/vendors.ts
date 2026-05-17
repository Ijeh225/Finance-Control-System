import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  totalBilled: numeric("total_billed", { precision: 15, scale: 2 }).notNull().default("0"),
  totalPaid: numeric("total_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  lastPaymentDate: timestamp("last_payment_date", { withTimezone: true }),
  containers: text("containers"),
  requestPurpose: text("request_purpose"),
  relatedLink: text("related_link"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ createdAt: true, totalBilled: true, totalPaid: true, outstandingBalance: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
