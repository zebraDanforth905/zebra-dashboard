// Reconcile duplicate customer rows.
//
// Pattern: same (name, email) pair appears twice — one row with portal_parent_id=NULL
// (the "live" row, has students/token/billing), one with portal_parent_id set
// (the "orphan" row, created by portal sync after the fact, no students/no billing).
//
// Action per pair:
//   1. Verify orphan has zero billing FKs (invoices/payments/recurring_invoices/converge_recurring_payments)
//      AND zero student/token references. If not, skip + log.
//   2. In a transaction:
//        - Clear orphan.portal_parent_id (so unique constraint frees up)
//        - Copy portal_parent_id from orphan to live
//        - Backfill live.alternate_email / live.alternate_name from orphan when live's
//          value is NULL and the corresponding *_locked flag is FALSE.
//   3. Leave orphan row in place (do not delete per CLAUDE.md rule #1).
//
// Usage:
//   node scripts/reconcile_customer_dupes.mjs            # dry-run
//   node scripts/reconcile_customer_dupes.mjs --apply    # execute

import postgres from "../node_modules/postgres/src/index.js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^POSTGRES_URL=(.+)$/m)[1].trim();
const sql = postgres(url, { ssl: "require" });

async function main() {
  // Find candidate pairs: same name + email, exactly one NULL pp + one non-NULL pp
  const pairs = await sql`
    WITH grouped AS (
      SELECT name, email, COUNT(*)::int AS n,
        SUM(CASE WHEN portal_parent_id IS NULL THEN 1 ELSE 0 END)::int AS null_n,
        SUM(CASE WHEN portal_parent_id IS NOT NULL THEN 1 ELSE 0 END)::int AS pp_n
      FROM customers
      GROUP BY name, email
    )
    SELECT name, email FROM grouped
    WHERE n = 2 AND null_n = 1 AND pp_n = 1
    ORDER BY name
  `;

  console.log(`Found ${pairs.length} candidate pairs.\n`);

  let reconciled = 0;
  let skipped = 0;
  const skipLog = [];

  for (const { name, email } of pairs) {
    const rows = await sql`
      SELECT id::text, name, email, alternate_email, alternate_name,
             portal_parent_id, alternate_email_locked, alternate_name_locked
      FROM customers
      WHERE name = ${name} AND email = ${email}
    `;
    const live = rows.find(r => r.portal_parent_id === null);
    const orphan = rows.find(r => r.portal_parent_id !== null);
    if (!live || !orphan) { skipped++; skipLog.push({ name, email, reason: "shape_changed" }); continue; }

    // Verify orphan has no billing or downstream FKs
    const [{ n: inv }] = await sql`SELECT COUNT(*)::int AS n FROM invoices WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: pay }] = await sql`SELECT COUNT(*)::int AS n FROM payments WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: rec }] = await sql`SELECT COUNT(*)::int AS n FROM recurring_invoices WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: conv }] = await sql`SELECT COUNT(*)::int AS n FROM converge_recurring_payments WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: stu }] = await sql`SELECT COUNT(*)::int AS n FROM students WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: tok }] = await sql`SELECT COUNT(*)::int AS n FROM parent_tokens WHERE customer_id=${orphan.id}::uuid`;

    if (inv + pay + rec + conv + stu + tok > 0) {
      skipped++;
      skipLog.push({ name, email, orphanId: orphan.id, reason: "orphan_has_refs", counts: { inv, pay, rec, conv, stu, tok } });
      continue;
    }

    // Decide what to copy
    const willCopyAltEmail = live.alternate_email === null
      && !live.alternate_email_locked
      && orphan.alternate_email !== null;
    const willCopyAltName = live.alternate_name === null
      && !live.alternate_name_locked
      && orphan.alternate_name !== null;

    console.log(
      `${APPLY ? "APPLY" : "DRY"}  ${name}  <${email}>  pp=${orphan.portal_parent_id}` +
      (willCopyAltEmail ? `  +altEmail=${orphan.alternate_email}` : "") +
      (willCopyAltName ? `  +altName=${orphan.alternate_name}` : ""),
    );

    if (APPLY) {
      await sql.begin(async tx => {
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
  if (skipLog.length) {
    console.log("\nSkip details:");
    console.log(JSON.stringify(skipLog, null, 2));
  }
}

await main();
await sql.end();
