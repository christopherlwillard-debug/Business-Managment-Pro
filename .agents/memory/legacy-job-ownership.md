---
name: Legacy job ownership
description: Compatibility rule for editing older jobs that predate business assignment
---

An unassigned legacy job can be claimed during a PUT when the request explicitly supplies the selected business slug. Scoped reads and unrelated mutations must continue to require existing ownership.

**Why:** Older production jobs were visible through the client’s legacy-unassigned fallback but were rejected by the API before the edit handler could assign them, making valid edits appear to fail.

**How to apply:** Preserve this narrow claim-on-edit exception; do not broaden `belongsToBusiness` globally or treat unassigned records as belonging to every business.