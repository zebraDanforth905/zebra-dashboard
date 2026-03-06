# Zebra Dashboard Bug List

Last updated: 2026-03-06

## Immediate Focus

### Kyle (Now)

| ID   | Area            | Task                                                                 | Notes                                                                                               | Status |
| ---- | --------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| B013 | Makeup classes  | Make manual "remove makeup class" changes persist after portal sync. | Add a local tombstone/ignore key table or manual-lock flag so sync does not re-add removed items. | Open   |

### Taite (Now) - Payments (Non-Security)

| ID   | Area               | Task                                                             | Notes                                                                                  | Status            |
| ---- | ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------- |
| B004 | Payments API + UI  | Fix payment delete flow mismatch (`customer_id` required by API). | UI sends `id` only today; either send `customer_id` or derive it server-side.         | Deferred to Taite |
| B009 | Payments precision | Prevent fractional-cent writes in payment amount storage.         | Use `Math.round(amount * 100)` for cents before DB writes.                            | Deferred to Taite |
| B003 | Recurring invoices | Make recurring invoice generation idempotent under concurrency.   | Use transaction + `FOR UPDATE SKIP LOCKED` + uniqueness guard for generated invoices. | Deferred to Taite |

## Longer-Term (Not Immediate)

| ID   | Category               | Issue (Summary)                                                        | Status                                        |
| ---- | ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| B001 | Security               | Unauthenticated write routes are publicly callable.                    | Open (Payment route portion deferred to Taite) |
| B002 | Security               | SQL injection risk via unsanitized `sortBy` in raw SQL.               | Open                                          |
| B005 | Security + Build       | Mutation GET routes still need full hardening (`POST` + auth/secret). | Mitigated (build) / Open (security)           |
| B006 | Auth                   | `/api/unassigned-students` still needs auth guard for data exposure.  | Mitigated (build) / Open (auth)               |
| B007 | Date handling          | Timezone drift risk from UTC ISO slicing for local-date logic.        | Open                                          |
| B008 | Scraper correctness    | Camp scrape ignores `branchId` and hardcodes branch `20`.             | Open                                          |
| B010 | Logging hygiene        | Sensitive information appears in server logs.                         | Open                                          |
| B011 | Billing UX correctness | Billing sort direction flag (`incDec`) is ignored.                    | Open                                          |
| B012 | Framework migration    | `middleware.ts` convention is deprecated in Next.js 16.               | Open                                          |
| B014 | Time display consistency | Non-schedule UI still shows 24-hour time strings in some views.      | Open (Schedule updated to AM/PM on 2026-03-06; review remaining pages later) |
| R001 | Engineering debt       | Lint debt blocks safer refactors and quality gates.                   | Open                                          |
| R002 | Engineering debt       | Unused/dead files create confusion.                                   | Open                                          |
