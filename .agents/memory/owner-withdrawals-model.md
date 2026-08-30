---
name: Owner withdrawals model
description: Durable naming and accounting boundary for owner-money transactions.
---

Use **Owner Withdrawals** as the only normal user-facing owner-money workflow. New withdrawals belong in the existing owner ledger as one negative record; never create an expense row or parallel ledger. Preserve historical positive contribution records internally for auditability, but do not expose contribution, capital, compensation, draw, or equity creation controls.

**Why:** A single plain-language concept prevents cash transfers to the owner from being mistaken for revenue, operating expenses, job costs, profit deductions, or tax deductions while retaining historical evidence.

**How to apply:** Any owner-money UI, report, or new endpoint should use Owner Withdrawal wording and the existing ledger. Subcontractor payroll, mileage, reserves, and job allocation calculations remain separate.