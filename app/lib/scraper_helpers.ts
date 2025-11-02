// app/lib/zebra.ts
const ZEBRA_API_BASE = process.env.ZEBRA_API_BASE!;
const EMAIL = process.env.ZEBRA_EMAIL!;
const PASSWORD = process.env.ZEBRA_PASSWORD!;

type ReportEndpoint = "class" | "class-makeup";

let tokenCache: { token: string | null; exp: number } = { token: null, exp: 0 };

async function loginGetToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - now > 60) return tokenCache.token;

  const r = await fetch(`${ZEBRA_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/plain, */*" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    // no-store avoids caching auth responses
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Auth failed: ${r.status} ${text.slice(0, 300)}`);
  }

  let data: any = {};
  try { data = await r.json(); } catch { /* ignore */ }

  const token = data?.token || data?.accessToken || r.headers.get("x-auth-token");
  if (!token) throw new Error("Auth ok but no token returned");

  // cache ~50 minutes
  tokenCache = { token, exp: now + 50 * 60 };
  return token;
}

export async function fetchReportJSON(options: {
  endpoint: ReportEndpoint; // "class" | "class-makeup"
  branchId: number;
  activeId: number;         // 1 = All usually
  day: string;              // "All" | "Monday" etc.
  fromDate?: string;        // "YYYY-MM-DD" when activeId != 1
  toDate?: string;
}) {
  const token = await loginGetToken();

  const { endpoint, branchId, activeId, day, fromDate, toDate } = options;
  let path = `${endpoint}/${branchId}/default/default/${activeId}/${day}`;
  if (String(activeId) !== "1" && fromDate && toDate) path += `/${fromDate}/${toDate}`;

  const url = `${ZEBRA_API_BASE}/reports/${path}`;
  const r = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-auth-token": token,
      referer: "https://portal.zebrarobotics.com/",
    },
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Report error ${r.status}: ${text.slice(0, 300)}`);
  }

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await r.text();
    throw new Error(`Expected JSON, got ${ct}: ${text.slice(0, 200)}`);
  }

  const data = await r.json();
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as any).results)) return (data as any).results;
  return data ? [data] : [];
}
