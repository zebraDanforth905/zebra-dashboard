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
const CANVAS_TOKEN_SETTING_KEY = 'CANVAS_API_TOKEN';
const CANVAS_TOKEN_CACHE_MS = 30_000;

export type CanvasTokenSource = 'environment' | 'database' | 'none';

export type CanvasTokenSettings = {
  configured: boolean;
  source: CanvasTokenSource;
  maskedToken: string | null;
};

type CachedCanvasToken = {
  value: string | null;
  loadedAt: number;
};

let canvasTokenCache: CachedCanvasToken | null = null;
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

async function getCanvasTokenFromDb() {
  const now = Date.now();
  if (canvasTokenCache && (now - canvasTokenCache.loadedAt) < CANVAS_TOKEN_CACHE_MS) {
    return canvasTokenCache.value;
  }

  if (!process.env.POSTGRES_URL) {
    return null;
  }

  try {
    const rows = await sql<{ setting_value: string | null }[]>`
      SELECT setting_value
      FROM app_settings
      WHERE setting_key = ${CANVAS_TOKEN_SETTING_KEY}
      LIMIT 1
    `;
    const token = normalizeToken(rows[0]?.setting_value);
    canvasTokenCache = { value: token, loadedAt: now };
    return token;
  } catch (error) {
    const pgError = error as { code?: string } | undefined;
    if (pgError?.code === '42P01' && !missingAppSettingsWarningShown) {
      console.error('Canvas API token is stored in app_settings, but that table is missing. Run migration 033_create_app_settings.sql before using dashboard token settings.');
      missingAppSettingsWarningShown = true;
    }

    if (!pgError?.code) {
      console.error('Failed to load Canvas token setting from app_settings:', error);
    }

    canvasTokenCache = { value: null, loadedAt: now };
    return null;
  }
}

export async function getCanvasTokenSettings(): Promise<CanvasTokenSettings> {
  const envToken = normalizeToken(process.env.CANVAS_API_TOKEN);
  if (envToken) {
    return {
      configured: true,
      source: 'environment',
      maskedToken: maskToken(envToken),
    };
  }

  const dbToken = await getCanvasTokenFromDb();
  if (dbToken) {
    return {
      configured: true,
      source: 'database',
      maskedToken: maskToken(dbToken),
    };
  }

  return {
    configured: false,
    source: 'none',
    maskedToken: null,
  };
}

export async function saveCanvasApiTokenToDb(rawToken: string | null | undefined) {
  if (!process.env.POSTGRES_URL) {
    throw new Error('Database URL is not configured.');
  }

  const token = normalizeToken(rawToken);

  if (!token) {
    await sql`
      DELETE FROM app_settings
      WHERE setting_key = ${CANVAS_TOKEN_SETTING_KEY}
    `;
    canvasTokenCache = null;
    return;
  }

  await sql`
    INSERT INTO app_settings (
      setting_key,
      setting_value,
      updated_at
    ) VALUES (
      ${CANVAS_TOKEN_SETTING_KEY},
      ${token},
      NOW()
    )
    ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_at = NOW()
  `;
  canvasTokenCache = null;
}

export function clearCanvasTokenCache() {
  canvasTokenCache = null;
}

async function getCanvasTokenFromEnvOrDb() {
  const envToken = normalizeToken(process.env.CANVAS_API_TOKEN);
  if (envToken) return envToken;

  return getCanvasTokenFromDb();
}

export async function isCanvasTokenConfigured() {
  return (await getCanvasTokenSettings()).configured;
}

export async function getCanvasPublicConfig() {
  const tokenSettings = await getCanvasTokenSettings();
  return {
    baseUrl: canvasBaseUrl(),
    configured: tokenSettings.configured,
  };
}

async function getCanvasToken() {
  const token = await getCanvasTokenFromEnvOrDb();
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
    const token = await getCanvasToken();
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
}

export function createCanvasClient() {
  return new CanvasClient();
}
