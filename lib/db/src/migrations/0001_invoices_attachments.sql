-- Migration: Add attachments column to invoices table
-- Run once per environment before deploying the attachment feature.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
