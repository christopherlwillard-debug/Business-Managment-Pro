# Schema Migration Coverage Report

Generated after migration set 0042–0044.

---

## Summary

```
=== Schema Migration Coverage Report ===

Tables in TypeScript schema:                     72
  - Covered by SQL migration files (0034–0044):  49
  - Covered by post-merge.sh inline blocks:      23
  - Overlap (table in both):                      0
  - UNCOVERED (no creation path):                 0  ← ✓

Gap columns with ADD COLUMN IF NOT EXISTS:       171 (0044_gap_columns.sql)
  - Exact per-column audit, no approximations
  - UNCOVERED gap columns:                         0  ← ✓

drizzle-kit push --force calls in post-merge.sh:  0  ← ✓
```

---

## Execution Order in post-merge.sh

The runner blocks must execute in this order to satisfy FK dependencies and
guarantee that every table exists before any ALTER TABLE references it:

```
1.  0041  — renames mfh_models→mfh_home_series, drops mfh_manufacturers
2.  0042  — CREATE TABLE IF NOT EXISTS: 16 base tables + mileage + plaid (19 total)
3.  [existing inline blocks] — creates 23 additional tables + early ADD COLUMN hotfixes
4.  0043  — CREATE TABLE IF NOT EXISTS: 20 extended tables
            (FK refs to job_checklist_items/job_checklists are satisfied by step 3)
5.  0044  — ALTER TABLE ADD COLUMN IF NOT EXISTS: 171 columns across 22 tables
            (every table is guaranteed to exist by steps 1–4)
```

---

## Authoritative Creation Path — By Table

Every table has **exactly one** authoritative creation point. All three SQL files
are idempotent (IF NOT EXISTS guards throughout).

### 0034 — website_configs.sql
| Table | Notes |
|---|---|
| website_configs | |

### 0035 — website_page_views.sql
| Table | Notes |
|---|---|
| website_page_views | |

### 0036 — website_media_v2.sql
| Table | Notes |
|---|---|
| website_media_folders | |

### 0037 — owner_capital_entries.sql
| Table | Notes |
|---|---|
| owner_capital_entries | |

### 0040 + 0041 — mfh.sql / mfh_home_series.sql
| Table | Notes |
|---|---|
| mfh_construction_types | created 0040 |
| mfh_pricing_guides | created 0040 |
| mfh_guide_items | created 0040 |
| mfh_guide_addons | created 0040 |
| mfh_home_series | created 0040 as mfh_models; renamed in 0041 |
| mfh_models | new table created in 0041 (model-level, FK to home_series) |

### 0042 — base_schema.sql (19 tables)
| Table | Notes |
|---|---|
| sessions | |
| users | |
| access_requests | |
| businesses | |
| settings | |
| clients | |
| subcontractors | |
| jobs | |
| job_subcontractors | |
| payments | |
| recurring_expenses | defined before expenses (FK dependency) |
| expenses | references recurring_expenses |
| invoices | |
| estimates | |
| quick_charges | |
| daily_logs | material_list_id column present; FK added after material_lists exists |
| mileage_imports | placed here (not 0043) so existing ADD COLUMN blocks can reference it |
| mileage_logs | placed here (not 0043); references expenses, mileage_imports |
| plaid_connections | placed here (not 0043) so existing ADD COLUMN blocks can reference it |

### 0043 — extended_tables.sql (20 tables)
Runs AFTER all inline blocks; FK references to job_checklist_items, job_checklists
are satisfied by the Task #929 inline block that runs before 0043.

| Table | Notes |
|---|---|
| vendors | |
| materials | |
| material_lists | |
| material_list_items | |
| job_sub_hours | |
| job_type_benchmarks | |
| generated_1099s | |
| portfolio_photos | |
| compliance_items | |
| ky_filing_settings | |
| conversations | |
| messages | |
| inquiries | |
| registered_agents | |
| registered_agent_tasks | |
| website_form_submissions | |
| sub_payment_records | |
| job_checklist_item_photos | FK → job_checklist_items (created by inline block before 0043) |
| job_checklist_item_parts | FK → job_checklist_items (created by inline block before 0043) |
| job_finished_photos | FK → job_checklists (created by inline block before 0043) |

### post-merge.sh Inline Blocks (grandfathered, 23 tables)
These tables were added before the SQL-file convention. They are idempotent
(IF NOT EXISTS) but their definitions live in the shell script rather than SQL
files. Follow-up task #1023 will consolidate them into SQL migration files.

| Table |
|---|
| other_income |
| featured_clients |
| route_stops |
| prospects |
| estimated_tax_payments |
| bank_import_batches |
| bank_transactions |
| assets |
| asset_business_use |
| bid_opportunities |
| prospect_events |
| prospect_service_visits |
| square_payments |
| deposit_submissions |
| client_errors |
| checklist_templates |
| checklist_template_sections |
| checklist_template_items |
| job_checklists |
| job_checklist_sections |
| job_checklist_items |
| contacts |
| website_media |

---

## Gap Columns — 0044_gap_columns.sql (171 columns, 22 tables)

All 171 `ADD COLUMN IF NOT EXISTS` statements were verified against the dev
database. Zero errors.

| Table | Column count | Columns |
|---|---|---|
| businesses | 3 | sort_order, enabled_features, parent_business_id |
| settings | 26 | dba_logo_url, entity_type, ein, invoice_logo_position, invoice_logo_size, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, mileage_default_classification, mileage_units, mileage_reminder_frequency, bottom_nav_items, compliance_notification_email, compliance_email_enabled, invoice_reminder_enabled, invoice_reminder_day1, invoice_reminder_day2, tax_filing_frequency, calculator_defaults, quick_links, signature_image, owner_user_id, threshold_amount_1099, enabled_features |
| clients | 5 | next_service_date, service_interval_months, business_line, square_customer_id, reminder_opt_out |
| subcontractors | 23 | w9_on_file, portal_token, portal_approved, w9_legal_name, w9_business_name, w9_tax_classification, w9_llc_type, w9_address, w9_city, w9_state, w9_zip, w9_tax_id_type, w9_tax_id, w9_signature, w9_signed_at, portal_features, portal_pin_hash, portal_pin_attempts, portal_pin_locked_until, pay_rate, pay_type, role, growth_pct |
| jobs | 18 | business_line, sub_paid, sq_ft, coats, phases, permit_checklist, home_model, mfh_series_id, mfh_model_id, mfh_model_year, mfh_dealer_price, mfh_quoted_price, mfh_guide_name, mfh_selected_addons, mfh_travel_days, closed_at, job_number, owner_pay_included |
| expenses | 5 | recurring_expense_id, exclude_from_net_profit, business_line, business_id, job_sub_hours_id |
| invoices | 10 | business_line, stripe_payment_link_id, stripe_payment_link_url, stripe_payment_intent_id, stripe_paid_at, square_payment_link_id, square_payment_link_url, square_paid_at, pay_token, reminders_sent_at |
| estimates | 10 | business_line, stripe_payment_link_id, stripe_payment_link_url, square_payment_link_id, square_payment_link_url, deposit_paid_at, deposit_paid_amount, mfh_dealer_price, mfh_quoted_price, mfh_guide_name |
| quick_charges | 10 | stripe_payment_link_id, stripe_payment_link_url, stripe_price_id, stripe_payment_intent_id, stripe_session_id, square_payment_link_id, square_payment_link_url, square_paid_at, pay_token, qr_code_data_url |
| daily_logs | 3 | photo_urls, material_list_id, author_name |
| bank_transactions | 1 | plaid_transaction_id |
| square_payments | 1 | client_id |
| bid_opportunities | 7 | business_id, source, source_label, ai_summary, ai_summary_at, stage, notes |
| mileage_logs | 3 | business_id, expense_id, import_id |
| other_income | 5 | business_line, client_id, job_id, city, state |
| prospects | 18 | city, state, zip, contact_email, follow_up_date, serviced_at, linked_invoice_id, client_id, stripe_payment_link_id, stripe_payment_link_url, square_payment_link_id, square_payment_link_url, deposit_paid_at, deposit_paid_amount, last_paid_at, measured_sq_ft, source, business_line |
| route_stops | 5 | block_number, crew_label, client_id, prospect_id, job_id |
| plaid_connections | 4 | cached_balance_current, cached_balance_available, cached_balance_currency, balance_cached_at |
| job_checklists | 1 | finished_notes |
| website_media | 2 | folder_id, display_name |
| assets | 4 | useful_life_years, salvage_value, depreciation_method, bonus_depreciation_pct |
| mfh_home_series | 7 | benchmark_id, checklist_template_id, default_addon_keys, notes, active, introduced_year, discontinued_year |
| **Total** | **171** | |

---

## Architectural Rules

1. **Never rename or restructure tables via automatic schema inference.**
   All renames must be explicit SQL migrations (0041 is the canonical example).

2. **Every schema object has exactly one authoritative creation path.**
   - SQL migration file = authoritative for all new tables going forward.
   - post-merge.sh = orchestrator only; not a schema definition file.

3. **drizzle-kit push --force must never run automatically during deployment.**
   It is retained in `lib/db/package.json` for local dev / scratch databases only.

4. **Adding a new table:** create `lib/db/migrations/004X_<name>.sql` with
   `CREATE TABLE IF NOT EXISTS`, add a runner block to the END of `post-merge.sh`
   (after step 3 inline blocks), and update this report.

5. **Adding a new column:** add `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS` to
   a new SQL migration file appended after 0044. Never rely only on the TypeScript
   schema — every column needs an explicit creation path.

6. **FK ordering rule:** any new SQL migration that FKs into a table created by
   post-merge.sh inline blocks must run AFTER those inline blocks (step 4/5 order),
   not before.

---

## Legacy Table Note

The production database contains a `services` table that does not appear in
any TypeScript schema file. It is a legacy table from early development and
is not managed by Drizzle. It can be dropped when confirmed safe.

---

## Verification Query

Run this against production to confirm zero uncovered tables:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name != 'services'   -- legacy, not in TS schema
ORDER BY table_name;
```

Expected: 72 rows, every row matching a `pgTable(...)` in `lib/db/src/schema/*.ts`.
