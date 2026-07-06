import { pgTable, serial, text, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

export const checklistTemplatesTable = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checklistTemplateSectionsTable = pgTable("checklist_template_sections", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => checklistTemplatesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const checklistTemplateItemsTable = pgTable("checklist_template_items", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull().references(() => checklistTemplateSectionsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const jobChecklistsTable = pgTable("job_checklists", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => checklistTemplatesTable.id, { onDelete: "set null" }),
  templateName: text("template_name").notNull(),
  shareToken: text("share_token").notNull().unique(),
  shareEnabled: boolean("share_enabled").notNull().default(true),
  statusOverride: text("status_override"),
  publicNotes: text("public_notes"),
  finishedNotes: text("finished_notes"),
  startNotes: text("start_notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobChecklistSectionsTable = pgTable("job_checklist_sections", {
  id: serial("id").primaryKey(),
  jobChecklistId: integer("job_checklist_id").notNull().references(() => jobChecklistsTable.id, { onDelete: "cascade" }),
  templateSectionId: integer("template_section_id"),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  percentComplete: numeric("percent_complete", { precision: 5, scale: 2 }).notNull().default("0"),
  completedAt: timestamp("completed_at"),
});

export const jobChecklistItemsTable = pgTable("job_checklist_items", {
  id: serial("id").primaryKey(),
  jobChecklistId: integer("job_checklist_id").notNull().references(() => jobChecklistsTable.id, { onDelete: "cascade" }),
  jobChecklistSectionId: integer("job_checklist_section_id").notNull().references(() => jobChecklistSectionsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  completedByUserId: text("completed_by_user_id"),
  completedByName: text("completed_by_name"),
  skipped: boolean("skipped").notNull().default(false),
  skippedAt: timestamp("skipped_at"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const jobChecklistItemPhotosTable = pgTable("job_checklist_item_photos", {
  id: serial("id").primaryKey(),
  jobChecklistItemId: integer("job_checklist_item_id").notNull().references(() => jobChecklistItemsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobChecklistItemPartsTable = pgTable("job_checklist_item_parts", {
  id: serial("id").primaryKey(),
  jobChecklistItemId: integer("job_checklist_item_id").notNull().references(() => jobChecklistItemsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  completedByUserId: text("completed_by_user_id"),
  completedByName: text("completed_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobFinishedPhotosTable = pgTable("job_finished_photos", {
  id: serial("id").primaryKey(),
  jobChecklistId: integer("job_checklist_id").notNull().references(() => jobChecklistsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobStartPhotosTable = pgTable("job_start_photos", {
  id: serial("id").primaryKey(),
  jobChecklistId: integer("job_checklist_id").notNull().references(() => jobChecklistsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobChecklistStatusLogTable = pgTable("job_checklist_status_log", {
  id: serial("id").primaryKey(),
  jobChecklistId: integer("job_checklist_id").notNull().references(() => jobChecklistsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  durationMin: integer("duration_min"),
});

export const jobChecklistSectionNotesTable = pgTable("job_checklist_section_notes", {
  id: serial("id").primaryKey(),
  jobChecklistSectionId: integer("job_checklist_section_id").notNull().references(() => jobChecklistSectionsTable.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull().default(""),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JobFinishedPhoto = typeof jobFinishedPhotosTable.$inferSelect;
export type JobStartPhoto = typeof jobStartPhotosTable.$inferSelect;
export type JobChecklistStatusLog = typeof jobChecklistStatusLogTable.$inferSelect;
export type JobChecklistSectionNote = typeof jobChecklistSectionNotesTable.$inferSelect;

export type ChecklistTemplate = typeof checklistTemplatesTable.$inferSelect;
export type ChecklistTemplateSection = typeof checklistTemplateSectionsTable.$inferSelect;
export type ChecklistTemplateItem = typeof checklistTemplateItemsTable.$inferSelect;
export type JobChecklist = typeof jobChecklistsTable.$inferSelect;
export type JobChecklistSection = typeof jobChecklistSectionsTable.$inferSelect;
export type JobChecklistItem = typeof jobChecklistItemsTable.$inferSelect;
