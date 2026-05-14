# Zebra Dashboard Bug List

Last updated: 2026-04-24

## Immediate Focus

### Kyle (Now)

| ID   | Area            | Task                                                                 | Notes                                                                                               | Status |
| ---- | --------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| B013 | Makeup classes  | Make manual "remove makeup class" changes persist after portal sync. | Add a local tombstone/ignore key table or manual-lock flag so sync does not re-add removed items. | Open   |
| B014 | Summer Reg      | `getSessionId` in `insert_from_portal.ts` uses old 3-column `ON CONFLICT`; breaks after migration 011 changed constraint to include `is_summer`. Next portal sync will fail. | Change `ON CONFLICT (weekday, start_time, end_time)` → `(start_time, end_time, weekday, is_summer)` and add `is_summer = FALSE` to the INSERT. **Critical — fix before next portal sync.** | Fixed |
| B015 | Summer Reg      | Fall session picker in parent form includes summer slots. `fetchParentFormData` fetches all sessions for the fall picker with no `is_summer` filter, so parents see summer-only time slots as fall options. | Add `WHERE is_summer = FALSE` (or `is_summer IS FALSE`) to the fall sessions subquery in `summer-data.ts`. | Fixed |
| B016 | Summer Reg      | Single-parent data model: students have one `customer_id`, so families with two separate parent accounts (e.g. Laura Labriola + Abe Khalil for James & Jonathan) only generate one token — the parent whose customer record the children are assigned to. The other parent never appears in the link management table and gets no link. | **Short-term**: enter the second parent's email as `alternate_email` on the primary customer record; the CSV export already includes `alternate_email`, so both get the same Constant Contact link. **Long-term**: schema change to support a household/family grouping (deferred). | Open |

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
| R001 | Engineering debt       | Lint debt blocks safer refactors and quality gates.                   | Open                                          |
| R002 | Engineering debt       | Unused/dead files create confusion.                                   | Open                                          |
