const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

function loadPostgresUrlFromEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((l) => l.startsWith('POSTGRES_URL='));
  if (!line) return null;
  return line.replace(/^POSTGRES_URL=/, '').trim().replace(/^"|"$/g, '');
}

const POSTGRES_URL = process.env.POSTGRES_URL || loadPostgresUrlFromEnvFile();
if (!POSTGRES_URL) {
  console.error('POSTGRES_URL not found in environment or .env file');
  process.exit(1);
}

const sql = postgres(POSTGRES_URL, { ssl: 'require' });

function qid(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function norm(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  return s.length ? s : null;
}

function chooseWinner(rows) {
  return [...rows].sort((a, b) => {
    const aPortal = a.portal_parent_id != null ? 1 : 0;
    const bPortal = b.portal_parent_id != null ? 1 : 0;
    if (aPortal !== bPortal) return bPortal - aPortal;

    const aQbo = a.set_up_qbo === true ? 1 : 0;
    const bQbo = b.set_up_qbo === true ? 1 : 0;
    if (aQbo !== bQbo) return bQbo - aQbo;

    return String(a.id).localeCompare(String(b.id));
  })[0];
}

async function getPrimaryDuplicateSummary(db) {
  const rows = await db.unsafe(`
    WITH d AS (
      SELECT LOWER(TRIM(email)) AS email_key, COUNT(*)::int AS cnt
      FROM customers
      WHERE email IS NOT NULL AND TRIM(email) <> ''
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    )
    SELECT COUNT(*)::int AS duplicate_groups,
           COALESCE(SUM(cnt), 0)::int AS rows_in_duplicate_groups
    FROM d
  `);
  return rows[0] || { duplicate_groups: 0, rows_in_duplicate_groups: 0 };
}

async function getAnyEmailCollisionSummary(db) {
  const rows = await db.unsafe(`
    WITH emails AS (
      SELECT id::text AS customer_id, LOWER(TRIM(email)) AS email_key
      FROM customers
      WHERE email IS NOT NULL AND TRIM(email) <> ''
      UNION
      SELECT id::text AS customer_id, LOWER(TRIM(alternate_email)) AS email_key
      FROM customers
      WHERE alternate_email IS NOT NULL AND TRIM(alternate_email) <> ''
    ),
    grouped AS (
      SELECT email_key, COUNT(DISTINCT customer_id)::int AS customer_count
      FROM emails
      GROUP BY email_key
      HAVING COUNT(DISTINCT customer_id) > 1
    )
    SELECT COUNT(*)::int AS collision_groups,
           COALESCE(SUM(customer_count),0)::int AS customers_in_collision_groups
    FROM grouped
  `);
  return rows[0] || { collision_groups: 0, customers_in_collision_groups: 0 };
}

async function main() {
  const beforePrimary = await getPrimaryDuplicateSummary(sql);
  const beforeAny = await getAnyEmailCollisionSummary(sql);

  const customers = await sql.unsafe(`
    SELECT id::text, name, email, alternate_name, alternate_email, portal_parent_id, set_up_qbo
    FROM customers
  `);

  const idToRow = new Map(customers.map((r) => [r.id, r]));
  const parent = new Map(customers.map((r) => [r.id, r.id]));

  function find(x) {
    let p = parent.get(x);
    while (p !== parent.get(p)) {
      parent.set(p, parent.get(parent.get(p)));
      p = parent.get(p);
    }
    return p;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  const emailToIds = new Map();
  for (const row of customers) {
    for (const key of [norm(row.email), norm(row.alternate_email)]) {
      if (!key) continue;
      if (!emailToIds.has(key)) emailToIds.set(key, []);
      emailToIds.get(key).push(row.id);
    }
  }

  for (const ids of emailToIds.values()) {
    for (let i = 1; i < ids.length; i += 1) {
      union(ids[0], ids[i]);
    }
  }

  const components = new Map();
  for (const row of customers) {
    const root = find(row.id);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(row);
  }

  const mergePlans = [];
  for (const rows of components.values()) {
    if (rows.length <= 1) continue;
    const winner = chooseWinner(rows);
    const duplicates = rows.filter((r) => r.id !== winner.id);
    if (duplicates.length) {
      mergePlans.push({ winner, duplicates });
    }
  }

  if (mergePlans.length === 0) {
    const afterPrimary = await getPrimaryDuplicateSummary(sql);
    const afterAny = await getAnyEmailCollisionSummary(sql);
    console.log(JSON.stringify({
      beforePrimary,
      beforeAny,
      message: 'No any-email collisions requiring merge',
      mergedCustomers: 0,
      afterPrimary,
      afterAny,
    }, null, 2));
    await sql.end({ timeout: 5 });
    return;
  }

  const fkRefs = await sql.unsafe(`
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class cref ON cref.oid = con.confrelid
    JOIN pg_namespace nref ON nref.oid = cref.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ck.attnum
    WHERE con.contype = 'f'
      AND nref.nspname = 'public'
      AND cref.relname = 'customers'
      AND n.nspname = 'public'
    ORDER BY table_schema, table_name, column_name
  `);

  const hasParentTokens = (await sql.unsafe(`SELECT to_regclass('public.parent_tokens') IS NOT NULL AS exists`))[0]?.exists;
  const hasParentRequests = (await sql.unsafe(`SELECT to_regclass('public.parent_requests') IS NOT NULL AS exists`))[0]?.exists;

  let mergedCustomers = 0;
  const touchedReferenceColumns = new Set();

  await sql.begin(async (tx) => {
    for (const plan of mergePlans) {
      const winnerId = plan.winner.id;
      for (const dup of plan.duplicates) {
        const duplicateId = dup.id;

        await tx.unsafe(`
          UPDATE customers c
          SET
            name = CASE WHEN c.name IS NULL OR TRIM(c.name) = '' THEN $2 ELSE c.name END,
            email = CASE WHEN c.email IS NULL OR TRIM(c.email) = '' THEN $3 ELSE c.email END,
            alternate_name = COALESCE(NULLIF(TRIM(c.alternate_name), ''), NULLIF(TRIM($4), '')),
            alternate_email = COALESCE(NULLIF(LOWER(TRIM(c.alternate_email)), ''), NULLIF(LOWER(TRIM($5)), '')),
            portal_parent_id = COALESCE(c.portal_parent_id, $6),
            set_up_qbo = COALESCE(c.set_up_qbo, FALSE) OR COALESCE($7, FALSE)
          WHERE c.id = $1::uuid
        `, [winnerId, dup.name, dup.email, dup.alternate_name, dup.alternate_email, dup.portal_parent_id, dup.set_up_qbo]);

        if (hasParentTokens) {
          const winnerToken = await tx.unsafe('SELECT id::text FROM parent_tokens WHERE customer_id = $1::uuid LIMIT 1', [winnerId]);
          const dupTokens = await tx.unsafe('SELECT id::text FROM parent_tokens WHERE customer_id = $1::uuid', [duplicateId]);

          if (dupTokens.length > 0) {
            if (winnerToken.length > 0) {
              const dupTokenIds = dupTokens.map((t) => t.id);
              if (hasParentRequests) {
                await tx.unsafe(`
                  UPDATE parent_requests
                  SET token_id = $1::uuid
                  WHERE token_id = ANY($2::uuid[])
                `, [winnerToken[0].id, dupTokenIds]);
              }
              await tx.unsafe('DELETE FROM parent_tokens WHERE id = ANY($1::uuid[])', [dupTokenIds]);
            } else {
              await tx.unsafe(`
                UPDATE parent_tokens
                SET customer_id = $1::uuid
                WHERE customer_id = $2::uuid
              `, [winnerId, duplicateId]);
            }
          }
        }

        for (const ref of fkRefs) {
          if (ref.table_name === 'parent_tokens') continue;
          const tableName = `${qid(ref.table_schema)}.${qid(ref.table_name)}`;
          const col = qid(ref.column_name);
          await tx.unsafe(`UPDATE ${tableName} SET ${col} = $1::uuid WHERE ${col} = $2::uuid`, [winnerId, duplicateId]);
          touchedReferenceColumns.add(`${ref.table_schema}.${ref.table_name}.${ref.column_name}`);
        }

        await tx.unsafe('DELETE FROM customers WHERE id = $1::uuid', [duplicateId]);
        mergedCustomers += 1;
      }
    }
  });

  const afterPrimary = await getPrimaryDuplicateSummary(sql);
  const afterAny = await getAnyEmailCollisionSummary(sql);

  console.log(JSON.stringify({
    beforePrimary,
    beforeAny,
    mergeComponentsProcessed: mergePlans.length,
    mergedCustomers,
    afterPrimary,
    afterAny,
    touchedReferenceColumns: Array.from(touchedReferenceColumns).sort(),
  }, null, 2));

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error(err);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
