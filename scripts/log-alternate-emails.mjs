// One-off script: fetch raw enrolment report and log parent/alternate_email fields
// Run: node --env-file=.env.local scripts/log-alternate-emails.mjs

const ZEBRA_API_BASE = process.env.ZEBRA_API_BASE;
const EMAIL = process.env.ZEBRA_EMAIL;
const PASSWORD = process.env.ZEBRA_PASSWORD;
const BRANCH_ID = process.env.ZEBRA_BRANCH_ID ?? '20';
const ACTIVE_ID = process.env.ZEBRA_ACTIVE_ID ?? '1';

async function getToken() {
  const r = await fetch(`${ZEBRA_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Auth failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const token = data?.token || data?.accessToken || r.headers.get('x-auth-token');
  if (!token) throw new Error('No token in auth response');
  return token;
}

async function fetchReport(token, endpoint) {
  const path = `${endpoint}/${BRANCH_ID}/default/default/${ACTIVE_ID}/All`;
  const url = `${ZEBRA_API_BASE}/reports/${path}`;
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'x-auth-token': token, referer: 'https://portal.zebrarobotics.com/' },
  });
  if (!r.ok) throw new Error(`Report error ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [data];
}

const token = await getToken();
console.log('Authenticated OK');

const rows = await fetchReport(token, 'class-makeup');
console.log(`Total rows: ${rows.length}`);

// Log all unique parent_id / email / alternate_emails combos
const seen = new Map();
for (const r of rows) {
  const key = r.parent_id ?? r.email;
  if (!seen.has(key)) {
    seen.set(key, {
      parent_id: r.parent_id,
      parent_name: r.parent_name,
      email: r.email,
      alternate_emails: r.alternate_emails,
    });
  }
}

console.log('\n=== Raw parent fields (deduplicated by parent_id/email) ===');
for (const [, p] of seen) {
  console.log(JSON.stringify(p));
}

// Highlight rows where alternate_emails is non-empty
const withAlt = [...seen.values()].filter(p => p.alternate_emails);
console.log(`\n=== Parents with non-empty alternate_emails (${withAlt.length}) ===`);
for (const p of withAlt) {
  console.log(JSON.stringify(p));
}

// Also show raw keys on first row so we know all available fields
if (rows.length > 0) {
  console.log('\n=== All keys on first raw row ===');
  console.log(Object.keys(rows[0]).join(', '));
}
