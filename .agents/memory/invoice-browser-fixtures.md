---
name: Invoice browser fixture identifiers
description: Constraint for safe authenticated browser fixtures that exercise invoice list rendering
---

Invoice browser-test invoice numbers must keep their numeric suffix within PostgreSQL's 32-bit integer range because the invoice list orders by casting digits from invoice numbers to `INTEGER`.

**Why:** A timestamp-based test identifier caused the real invoice list query to fail before any UI assertions ran.

**How to apply:** Use a short numeric run suffix in temporary invoice numbers and always delete the fixture rows in `finally`.