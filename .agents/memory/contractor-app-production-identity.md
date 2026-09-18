---
name: Contractor App production identity
description: Separates the internal Contractor App deployment from the public Willard's GC website
---

The active product is the internal Contractor Management App named Willards General Contracting. Its Contractor App production deployment is `https://business-managment-pro.replit.app`; `https://willardsgc.com` is the separate public-facing business website.

**Why:** The custom public domain can appear as the deployment service's primary URL even though it is not the authenticated Contractor App target. Using it for job, schedule, workday, invoice, financial, or database verification validates the wrong application.

**How to apply:** Before any Contractor App production check, resolve the published Contractor App deployment and use `https://business-managment-pro.replit.app`. Never substitute `willardsgc.com`, and do not describe that public website as the Contractor App deployment.