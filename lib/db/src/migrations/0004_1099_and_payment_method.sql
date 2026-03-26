-- Migration 0004: Add generated_1099s table and payment_method to payments
-- Safe to run multiple times (IF NOT EXISTS guards).

-- Add payment_method column to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Create generated_1099s table for storing admin-generated 1099-NEC PDFs
CREATE TABLE IF NOT EXISTS generated_1099s (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  subcontractor_id INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  tax_year    INTEGER NOT NULL,
  total_paid  NUMERIC(12, 2) NOT NULL,
  pdf_data    TEXT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
