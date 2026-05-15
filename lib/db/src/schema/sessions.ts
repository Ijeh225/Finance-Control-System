import { pgTable, text, timestamp, json } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});
