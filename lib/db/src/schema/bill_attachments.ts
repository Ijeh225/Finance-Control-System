import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { billsTable } from "./bills";
import { usersTable } from "./users";

export const billAttachmentsTable = pgTable("bill_attachments", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  storedKey: text("stored_key"),
  confirmed: boolean("confirmed").notNull().default(false),
  uploadedBy: text("uploaded_by").notNull().references(() => usersTable.id),
  uploadedByName: text("uploaded_by_name").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BillAttachment = typeof billAttachmentsTable.$inferSelect;
export type InsertBillAttachment = typeof billAttachmentsTable.$inferInsert;
