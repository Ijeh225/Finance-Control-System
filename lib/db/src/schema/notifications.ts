import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type", {
    enum: [
      "bill_approved",
      "bill_rejected",
      "bill_partial",
      "bill_held",
      "bill_submitted",
      "payment_processed",
      "comment_added",
      "wallet_low",
      "overdue_warning",
      "duplicate_detected",
      "escalated",
      "attachment_uploaded",
    ],
  }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  billId: text("bill_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ isRead: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
