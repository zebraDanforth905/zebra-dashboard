// Reconcile v3 — groups duplicates by LOWER(TRIM(email)) only.
//
// Handles the case where staff edited the customer name into a custom format
// (e.g. "Amanda Fernandes and Alan Garcia") so v1/v2's name-equality grouping
// missed the duplicate. Email is the more stable key.
//
// Per email group (must have exactly 2 rows, one pp-NULL + one pp-set):
//   live   = pp-NULL row with most refs (students+tokens+invoices)
//   orphan = pp-set row
//   - skip if orphan has billing FKs or parent_tokens
//   - if orphan has students, move them to live
//   - clear orphan.portal_parent_id (unique constraint)
//   - copy portal_parent_id, alternate_email, alternate_name from orphan → live
//     only when live's value is NULL + corresponding _locked flag is false
//   - never touch live.name (staff edits preserved)
//
// Usage:
//   node scripts/reconcile_customer_dupes_v3.mjs            # dry-run
//   node scripts/reconcile_customer_dupes_v3.mjs --apply

import postgres from "../node_modules/postgres/src/index.js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^POSTGRES_URL=(.+)$/m)[1].trim();
const sql = postgres(url, { ssl: "require" });

async function rowStats(id) {
  const [{ n: stu }] = await sql`SELECT COUNT(*)::int AS n FROM students WHERE customer_id=${id}::uuid`;
  const [{ n: tok }] = await sql`SELECT COUNT(*)::int AS n FROM parent_tokens WHERE customer_id=${id}::uuid`;
  const [{ n: inv }] = await sql`SELECT COUNT(*)::int AS n FROM invoices WHERE customer_id=${id}::uuid`;
  const [{ n: pay }] = await sql`SELECT COUNT(*)::int AS n FROM payments WHERE customer_id=${id}::uuid`;
  const [{ n: rec }] = await sql`SELECT COUNT(*)::int AS n FROM recurring_invoices WHERE customer_id=${id}::uuid`;
  const [{ n: conv }] = await sql`SELECT COUNT(*)::int AS n FROM converge_recurring_payments WHERE customer_id=${id}::uuid`;
  return { stu, tok, inv, pay, rec, conv };
}

async function main() {
  const groups = await sql`
    WITH g AS (
      SELECT LOWER(TRIM(email)) AS email_norm, COUNT(*)::int AS n,
        SUM(CASE WHEN portal_parent_id IS NULL THEN 1 ELSE 0 END)::int AS null_n,
        SUM(CASE WHEN portal_parent_id IS NOT NULL THEN 1 ELSE 0 END)::int AS pp_n
      FROM customers
      GROUP BY LOWER(TRIM(email))
    )
    SELECT email_norm FROM g WHERE n = 2 AND null_n = 1 AND pp_n = 1
  `;

  let reconciled = 0, skipped = 0;
  const skipLog = [];

  for (const { email_norm } of groups) {
    const rows = await sql`
      SELECT id::text, name, email, alternate_email, alternate_name,
             portal_parent_id, alternate_email_locked, alternate_name_locked
      FROM customers WHERE LOWER(TRIM(email)) = ${email_norm}
    `;
    const ppNull = rows.find(r => r.portal_parent_id === null);
    const ppSet = rows.find(r => r.portal_parent_id !== null);
    if (!ppNull || !ppSet) { skipped++; skipLog.push({ email_norm, reason: "shape" }); continue; }

    const nullStats = await rowStats(ppNull.id);
    const setStats = await rowStats(ppSet.id);

    // Determine live = the row with most refs (regardless of pp state)
    const nullScore = nullStats.stu + nullStats.tok + nullStats.inv + nullStats.pay + nullStats.rec + nullStats.conv;
    const setScore = setStats.stu + setStats.tok + setStats.inv + setStats.pay + setStats.rec + setStats.conv;

    // Already correctly reconciled = pp-set side has the refs and pp-null is empty.
    if (setScore > 0 && nullScore === 0) { continue; }

    // Standard pattern: live is pp-NULL (has refs), orphan is pp-set (empty or just students).
    if (!(nullScore > 0 && setScore <= nullStats.stu /*allow orphan to have some students only*/ )) {
      // Not the expected pattern — both sides have non-student refs. Skip + log.
      skipped++;
      skipLog.push({ email_norm, reason: "ambiguous", ppNull: { id: ppNull.id, name: ppNull.name, ...nullStats }, ppSet: { id: ppSet.id, name: ppSet.name, ...setStats } });
      continue;
    }

    // Orphan must have no billing/token (students OK — we'll move them)
    if (setStats.inv + setStats.pay + setStats.rec + setStats.conv + setStats.tok > 0) {
      skipped++;
      skipLog.push({ email_norm, reason: "orphan_has_billing_or_token", orphanStats: setStats });
      continue;
    }

    const live = ppNull;
    const orphan = ppSet;
    const moveStudents = setStats.stu;

    const willCopyAltEmail = live.alternate_email === null
      && !live.alternate_email_locked
      && orphan.alternate_email !== null;
    const willCopyAltName = live.alternate_name === null
      && !live.alternate_name_locked
      && orphan.alternate_name !== null;

    console.log(
      `${APPLY ? "APPLY" : "DRY"}  ${email_norm}  live="${live.name}"  orphan="${orphan.name}"  pp=${orphan.portal_parent_id}  moveStu=${moveStudents}` +
      (willCopyAltEmail ? `  +altEmail=${orphan.alternate_email}` : "") +
      (willCopyAltName ? `  +altName=${orphan.alternate_name}` : ""),
    );

    if (APPLY) {
      await sql.begin(async tx => {
        if (moveStudents > 0) {
          await tx`UPDATE students SET customer_id = ${live.id}::uuid WHERE customer_id = ${orphan.id}::uuid`;
        }
        await tx`UPDATE customers SET portal_parent_id = NULL WHERE id = ${orphan.id}::uuid`;
        await tx`
          UPDATE customers
          SET portal_parent_id = ${orphan.portal_parent_id},
              alternate_email = CASE WHEN ${willCopyAltEmail}::boolean THEN ${orphan.alternate_email} ELSE alternate_email END,
              alternate_name  = CASE WHEN ${willCopyAltName}::boolean  THEN ${orphan.alternate_name}  ELSE alternate_name  END
          WHERE id = ${live.id}::uuid
        `;
      });
    }
    reconciled++;
  }

  console.log(`\nReconciled: ${reconciled}, Skipped: ${skipped}, Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  if (skipLog.length) console.log("\nSkip:\n" + JSON.stringify(skipLog, null, 2));
}

await main();
await sql.end();
