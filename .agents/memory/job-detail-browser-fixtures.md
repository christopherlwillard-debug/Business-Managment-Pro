---
name: Job detail browser fixtures
description: Reliable authenticated browser coverage for job-scoped detail panels
---

Authenticated browser checks for job detail panels must scope actions to the specific job card heading. A page can contain repeated job titles and multiple matching action buttons, so a title-only ancestor search can open a different card than the one named by the test.

**Why:** A delayed Job Financials regression test initially opened the wrong fixture card even though the click helper reported success, making the test appear to exercise one job while requests belonged to another.

**How to apply:** Prefer a heading/card-scoped click helper for job-specific actions, and assert request paths plus visible detail rows for the selected job.