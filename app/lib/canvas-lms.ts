import postgres from 'postgres';

type CanvasRequestInit = RequestInit & {
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
};

export type CanvasUser = {
  id: string | number;
  name?: string | null;
  login_id?: string | null;
  email?: string | null;
  sis_user_id?: string | null;
};

export type CanvasCourse = {
  id: string | number;
  name?: string | null;
  course_code?: string | null;
  workflow_state?: string | null;
};

export type CanvasEnrollment = {
  id: string | number;
  user_id?: string | number;
  course_id?: string | number;
  enrollment_state?: string | null;
  type?: string | null;
  role?: string | null;
  updated_at?: string | null;
};

export type CanvasLogin = {
  id: string | number;
  account_id?: string | number | null;
  unique_id?: string | null;
  user_id?: string | number | null;
  workflow_state?: string | null;
};

export type NormalizedCanvasEnrollment = {
  enrollment_id: string;
  course_id: string;
  course_name: string | null;
  state: string;
  role: string | null;
  type: string | null;
  updated_at: string | null;
};

export class CanvasConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasConfigError';
  }
}

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const LEGACY_CANVAS_TOKEN_SETTING_KEY = 'CANVAS_API_TOKEN';
const CANVAS_TOKEN_CACHE_MS = 30_000;
const CANVAS_TOKEN_TEST_TIMEOUT_MS = 10_000;

export type CanvasTokenSource = 'user_database' | 'environment' | 'legacy_database' | 'none';

export type CanvasTokenSettings = {
  configured: boolean;
  source: CanvasTokenSource;
  maskedToken: string | null;
};

type CachedCanvasToken = {
  value: string | null;
  loadedAt: number;
};

const canvasTokenCache = new Map<string, CachedCanvasToken>();
let missingUserCanvasTokensWarningShown = false;
let missingAppSettingsWarningShown = false;

function normalizeToken(value: string | null | undefined) {
  return value?.trim() || null;
}

function maskToken(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function canvasBaseUrl() {
  return (process.env.CANVAS_BASE_URL?.trim() || 'https://lms.zebrarobotics.com').replace(/\/+$/, '');
}

function cacheKeyForUser(userId: string) {
  return `user:${userId}`;
}

async function getCanvasTokenFromUserDb(userId: string | null | undefined) {
  if (!userId) return null;

  const now = Date.now();
  const cacheKey = cacheKeyForUser(userId);
  const cached = canvasTokenCache.get(cacheKey);
  if (cached && (now - cached.loadedAt) < CANVAS_TOKEN_CACHE_MS) {
    return cached.value;
  }

  if (!process.env.POSTGRES_URL) {
    return null;
  }

  try {
    const rows = await sql<{ token_value: string | null }[]>`
      SELECT token_value
      FROM user_canvas_api_tokens
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const token = normalizeToken(rows[0]?.token_value);
    canvasTokenCache.set(cacheKey, { value: token, loadedAt: now });
    return token;
  } catch (error) {
    const pgError = error as { code?: string } | undefined;
    if (pgError?.code === '42P01' && !missingUserCanvasTokensWarningShown) {
      console.error('Per-user Canvas API tokens need migration 043_create_user_canvas_api_tokens.sql.');
      missingUserCanvasTokensWarningShown = true;
    }

    if (!pgError?.code) {
      console.error('Failed to load per-user Canvas token setting:', error);
    }

    canvasTokenCache.set(cacheKey, { value: null, loadedAt: now });
    return null;
  }
}

async function getLegacyCanvasTokenFromDb() {
  const now = Date.now();
  const cacheKey = 'legacy';
  const cached = canvasTokenCache.get(cacheKey);
  if (cached && (now - cached.loadedAt) < CANVAS_TOKEN_CACHE_MS) {
    return cached.value;
  }

  if (!process.env.POSTGRES_URL) {
    return null;
  }

  try {
    const rows = await sql<{ setting_value: string | null }[]>`
      SELECT setting_value
      FROM app_settings
      WHERE setting_key = ${LEGACY_CANVAS_TOKEN_SETTING_KEY}
      LIMIT 1
    `;
    const token = normalizeToken(rows[0]?.setting_value);
    canvasTokenCache.set(cacheKey, { value: token, loadedAt: now });
    return token;
  } catch (error) {
    const pgError = error as { code?: string } | undefined;
    if (pgError?.code === '42P01' && !missingAppSettingsWarningShown) {
      console.error('Legacy Canvas API token fallback uses app_settings, but that table is missing. Run migration 033_create_app_settings.sql if legacy fallback is needed.');
      missingAppSettingsWarningShown = true;
    }

    if (!pgError?.code) {
      console.error('Failed to load legacy Canvas token setting from app_settings:', error);
    }

    canvasTokenCache.set(cacheKey, { value: null, loadedAt: now });
    return null;
  }
}

export async function getCanvasTokenSettings(userId?: string | null): Promise<CanvasTokenSettings> {
  const userDbToken = await getCanvasTokenFromUserDb(userId);
  if (userDbToken) {
    return {
      configured: true,
      source: 'user_database',
      maskedToken: maskToken(userDbToken),
    };
  }

  const envToken = normalizeToken(process.env.CANVAS_API_TOKEN);
  if (envToken) {
    return {
      configured: true,
      source: 'environment',
      maskedToken: maskToken(envToken),
    };
  }

  const legacyDbToken = await getLegacyCanvasTokenFromDb();
  if (legacyDbToken) {
    return {
      configured: true,
      source: 'legacy_database',
      maskedToken: maskToken(legacyDbToken),
    };
  }

  return {
    configured: false,
    source: 'none',
    maskedToken: null,
  };
}

export async function saveCanvasApiTokenToDb(userId: string, rawToken: string | null | undefined) {
  if (!process.env.POSTGRES_URL) {
    throw new Error('Database URL is not configured.');
  }

  const token = normalizeToken(rawToken);

  if (!token) {
    await sql`
      DELETE FROM user_canvas_api_tokens
      WHERE user_id = ${userId}::uuid
    `;
    canvasTokenCache.delete(cacheKeyForUser(userId));
    return;
  }

  await sql`
    INSERT INTO user_canvas_api_tokens (
      user_id,
      token_value,
      updated_at
    ) VALUES (
      ${userId}::uuid,
      ${token},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET token_value = EXCLUDED.token_value,
        updated_at = NOW()
  `;
  canvasTokenCache.delete(cacheKeyForUser(userId));
}

export function clearCanvasTokenCache(userId?: string | null) {
  if (userId) {
    canvasTokenCache.delete(cacheKeyForUser(userId));
    return;
  }

  canvasTokenCache.clear();
}

async function getCanvasTokenFromDbOrEnv(userId?: string | null) {
  const userDbToken = await getCanvasTokenFromUserDb(userId);
  if (userDbToken) return userDbToken;

  const envToken = normalizeToken(process.env.CANVAS_API_TOKEN);
  if (envToken) return envToken;

  return getLegacyCanvasTokenFromDb();
}

export async function isCanvasTokenConfigured(userId?: string | null) {
  return (await getCanvasTokenSettings(userId)).configured;
}

export async function getCanvasPublicConfig(userId?: string | null) {
  const tokenSettings = await getCanvasTokenSettings(userId);
  return {
    baseUrl: canvasBaseUrl(),
    configured: tokenSettings.configured,
    source: tokenSettings.source,
    maskedToken: tokenSettings.maskedToken,
  };
}

async function getCanvasToken(userId?: string | null) {
  const token = await getCanvasTokenFromDbOrEnv(userId);
  if (!token) {
    throw new CanvasConfigError('Canvas API token is not configured.');
  }
  return token;
}

function appendQuery(url: URL, query?: CanvasRequestInit['query']) {
  if (!query) return;

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
    } else {
      url.searchParams.set(key, String(value));
    }
  });
}

function parseNextLink(linkHeader: string | null) {
  if (!linkHeader) return null;

  const links = linkHeader.split(',');
  for (const link of links) {
    const [rawUrl, rawRel] = link.split(';').map((part) => part.trim());
    if (rawRel === 'rel="next"') {
      return rawUrl.replace(/^<|>$/g, '');
    }
  }

  return null;
}

export class CanvasClient {
  private courseCache = new Map<string, CanvasCourse | null>();

  constructor(private readonly userId?: string | null) {}

  private url(pathOrUrl: string, query?: CanvasRequestInit['query']) {
    const url = pathOrUrl.startsWith('http')
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, canvasBaseUrl());
    appendQuery(url, query);
    return url;
  }

  private async request<T>(pathOrUrl: string, init: CanvasRequestInit = {}): Promise<{
    data: T;
    nextUrl: string | null;
  }> {
    const token = await getCanvasToken(this.userId);
    const url = this.url(pathOrUrl, init.query);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json+canvas-string-ids');

    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/x-www-form-urlencoded');
    }

    const response = await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'message' in data
        ? String((data as { message?: unknown }).message)
        : text.slice(0, 500);
      throw new Error(`Canvas API ${response.status}: ${message}`);
    }

    return {
      data: data as T,
      nextUrl: parseNextLink(response.headers.get('link')),
    };
  }

  private async requestAll<T>(path: string, query?: CanvasRequestInit['query']): Promise<T[]> {
    const rows: T[] = [];
    let nextUrl: string | null = path;
    let nextQuery = query;

    while (nextUrl) {
      const result: { data: T[]; nextUrl: string | null } = await this.request<T[]>(nextUrl, { query: nextQuery });
      rows.push(...result.data);
      nextUrl = result.nextUrl;
      nextQuery = undefined;
    }

    return rows;
  }

  async searchUsers(term: string) {
    const accountId = process.env.CANVAS_ACCOUNT_ID || 'self';
    return this.requestAll<CanvasUser>(`/api/v1/accounts/${accountId}/users`, {
      search_term: term,
      per_page: 50,
    });
  }

  async searchCourses(term: string) {
    const accountId = process.env.CANVAS_ACCOUNT_ID || 'self';
    return this.requestAll<CanvasCourse>(`/api/v1/accounts/${accountId}/courses`, {
      search_term: term,
      per_page: 50,
    });
  }

  async getUserEnrollments(userId: string) {
    return this.requestAll<CanvasEnrollment>(`/api/v1/users/${encodeURIComponent(userId)}/enrollments`, {
      'type[]': 'StudentEnrollment',
      'state[]': ['active', 'inactive', 'invited'],
      per_page: 100,
    });
  }

  async getCourse(courseId: string) {
    if (this.courseCache.has(courseId)) {
      return this.courseCache.get(courseId) ?? null;
    }

    try {
      const result = await this.request<CanvasCourse>(`/api/v1/courses/${encodeURIComponent(courseId)}`);
      this.courseCache.set(courseId, result.data);
      return result.data;
    } catch {
      this.courseCache.set(courseId, null);
      return null;
    }
  }

  async enrichEnrollments(enrollments: CanvasEnrollment[]): Promise<NormalizedCanvasEnrollment[]> {
    const normalized: NormalizedCanvasEnrollment[] = [];

    for (const enrollment of enrollments) {
      const courseId = enrollment.course_id == null ? null : String(enrollment.course_id);
      const enrollmentId = enrollment.id == null ? null : String(enrollment.id);
      if (!courseId || !enrollmentId) continue;

      const course = await this.getCourse(courseId);
      normalized.push({
        enrollment_id: enrollmentId,
        course_id: courseId,
        course_name: course?.name ?? course?.course_code ?? null,
        state: enrollment.enrollment_state ?? 'unknown',
        role: enrollment.role ?? null,
        type: enrollment.type ?? null,
        updated_at: enrollment.updated_at ?? null,
      });
    }

    return normalized;
  }

  async enrollStudent(courseId: string, userId: string) {
    const body = new URLSearchParams({
      'enrollment[user_id]': userId,
      'enrollment[type]': 'StudentEnrollment',
      'enrollment[enrollment_state]': 'active',
      'enrollment[notify]': 'false',
    });

    const result = await this.request<CanvasEnrollment>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/enrollments`,
      {
        method: 'POST',
        body,
      }
    );

    return result.data;
  }

  async inactivateEnrollment(courseId: string, enrollmentId: string) {
    const result = await this.request<CanvasEnrollment>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}`,
      {
        method: 'DELETE',
        query: { task: 'inactivate' },
      }
    );

    return result.data;
  }

  async createUser({ name, loginId, email }: { name: string; loginId: string; email: string }) {
    const accountId = process.env.CANVAS_ACCOUNT_ID || 'self';
    const body = new URLSearchParams({
      'user[name]': name,
      'user[skip_registration]': 'true',
      'pseudonym[unique_id]': loginId,
      'pseudonym[send_confirmation]': 'false',
      'communication_channel[type]': 'email',
      'communication_channel[address]': email,
      'communication_channel[skip_confirmation]': 'true',
    });

    const result = await this.request<CanvasUser>(
      `/api/v1/accounts/${accountId}/users`,
      {
        method: 'POST',
        body,
      }
    );

    return result.data;
  }

  async getUserLogins(userId: string) {
    return this.requestAll<CanvasLogin>(`/api/v1/users/${encodeURIComponent(userId)}/logins`, {
      per_page: 50,
    });
  }

  async updateLoginPassword(loginId: string, password: string, accountId = process.env.CANVAS_ACCOUNT_ID || 'self') {
    const body = new URLSearchParams({
      'login[password]': password,
    });

    const result = await this.request<CanvasLogin>(
      `/api/v1/accounts/${accountId}/logins/${encodeURIComponent(loginId)}`,
      {
        method: 'PUT',
        body,
      }
    );

    return result.data;
  }

  async setUserLoginPassword(userId: string, loginId: string, password: string) {
    const logins = await this.getUserLogins(userId);
    const normalizedLoginId = loginId.trim().toLowerCase();
    const login = logins.find((candidate) =>
      String(candidate.unique_id ?? '').trim().toLowerCase() === normalizedLoginId
    ) ?? logins[0];

    if (!login?.id) {
      throw new Error('Canvas login was not found for this user.');
    }

    return this.updateLoginPassword(String(login.id), password, String(login.account_id ?? process.env.CANVAS_ACCOUNT_ID ?? 'self'));
  }

  async reactivateEnrollment(courseId: string, enrollmentId: string) {
    const result = await this.request<CanvasEnrollment>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}/reactivate`,
      {
        method: 'PUT',
      }
    );

    return result.data;
  }
}

export function createCanvasClient(userId?: string | null) {
  return new CanvasClient(userId);
}

function canvasErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withCanvasTokenTestTimeout<T>(work: Promise<T>) {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Canvas API token test timed out after ${CANVAS_TOKEN_TEST_TIMEOUT_MS / 1000}s.`)), CANVAS_TOKEN_TEST_TIMEOUT_MS);
    }),
  ]);
}

export async function testCanvasApiToken(userId?: string | null) {
  const settings = await getCanvasTokenSettings(userId);
  if (!settings.configured) {
    return {
      ok: false,
      error: 'Canvas API token is not configured.',
      resultCount: 0,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CANVAS_TOKEN_TEST_TIMEOUT_MS);
  try {
    const token = await getCanvasToken(userId);
    const accountId = process.env.CANVAS_ACCOUNT_ID || 'self';
    const url = new URL(`/api/v1/accounts/${encodeURIComponent(accountId)}/users`, canvasBaseUrl());
    url.searchParams.set('search_term', 'zebra');
    url.searchParams.set('per_page', '1');

    const response = await withCanvasTokenTestTimeout(fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json+canvas-string-ids',
      },
      cache: 'no-store',
      signal: controller.signal,
    }));
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'message' in data
        ? String((data as { message?: unknown }).message)
        : text.slice(0, 500);
      throw new Error(`Canvas API ${response.status}: ${message}`);
    }

    const resultCount = Array.isArray(data) ? data.length : 0;
    return {
      ok: true,
      error: null,
      resultCount,
    };
  } catch (error) {
    return {
      ok: false,
      error: canvasErrorMessage(error),
      resultCount: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
