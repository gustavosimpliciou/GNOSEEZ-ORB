import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const voicesTable = pgTable("voices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fishReferenceId: text("fish_reference_id").notNull(),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVoiceSchema = createInsertSchema(voicesTable).omit({ id: true, createdAt: true });
export type InsertVoice = z.infer<typeof insertVoiceSchema>;
export type Voice = typeof voicesTable.$inferSelect;
