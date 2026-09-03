---
name: Date-safe test fixtures
description: Avoid date-sensitive test failures caused by fixtures placed after the current day
---

Current-month test fixtures should use a date guaranteed to be in the past or today, such as the first day of the month, rather than an arbitrary day later in the month.

**Why:** The development environment clock can run before a hard-coded day like the 10th, causing correct date-range filtering to exclude a fixture that the test describes as current-month.

**How to apply:** For tests that derive the current month from `new Date()`, use day `01` or derive the actual current day; reserve later fixed days for tests explicitly covering future-date exclusion.