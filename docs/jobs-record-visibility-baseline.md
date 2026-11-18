# Jobs Record-Visibility Baseline

**Verified:** November 17, 2026  
**Purpose:** Record the supported General Contracting job counts and retire the unsupported 93-job expectation.

## Corrected baseline

| Environment | Scope | Verified jobs |
| --- | --- | ---: |
| Production | Business 1, General Contracting | 33 |
| Development | Business 1, General Contracting | 107 |
| Development | All business scopes | 159 |

Production and development contain different datasets. The development count is not expected to match production.

## Jobs page reconciliation

The authenticated development Jobs page was checked with the General Contracting filter. The filtered API returned 107 job IDs. After expanding the collapsed **Awaiting Payment**, **Paid**, and **Closed Jobs** sections, the page rendered 107 unique job cards: no API IDs were missing and no extra cards appeared.

The initial 46-card display was caused by collapsed sections. It was not evidence that jobs were missing or failing to load.

## Retired expectation

The previous expectation of **93 General Contracting jobs** had no established source, query, business scope, environment, or record list. It was withdrawn and is invalid. Do not use 93 as a target, success criterion, or reason to recreate, delete, or modify records.

## Development-only records outside the General Contracting scope

The current development total includes 50 E2E-labeled jobs across ten other business scopes and two jobs with unassigned business and work-type fields. These rows are outside the 107-job General Contracting scope; this verification did not modify them.

The previously reported development total of 117 is historical, not the current all-scope total.

## Verification boundaries

- Production count: read-only production database query using the Business 1 and General Contracting scope.
- Development count and page reconciliation: development database reads and an authenticated, read-only Jobs page check.
- No production or development records were changed, and no deployment occurred.
- Production page card-by-card rendering and production-to-development historical-record identity were not verified by this check.
