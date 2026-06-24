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
  enrollments_count?: number | null;
  total_students?: number | null;
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

function canvasBaseUrl() {
  return (process.env.CANVAS_BASE_URL?.trim() || 'https://lms.zebrarobotics.com').replace(/\/+$/, '');
}

export function getCanvasPublicConfig() {
  return {
    baseUrl: canvasBaseUrl(),
    configured: Boolean(process.env.CANVAS_API_TOKEN?.trim()),
  };
}

function getCanvasToken() {
  const token = process.env.CANVAS_API_TOKEN?.trim();
  if (!token) {
    throw new CanvasConfigError('Canvas API token is not configured.');
  }
  return token;
}

function getCanvasAccountId() {
  const accountId = process.env.CANVAS_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new CanvasConfigError('Canvas account ID is not configured.');
  }
  return accountId;
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
    const token = getCanvasToken();
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
      'include[]': ['total_students'],
      per_page: 50,
    });
  }

  async createStudentUser(input: {
    name: string;
    loginId: string;
    password: string;
    sisUserId?: string;
    includeSisUserId?: boolean;
  }) {
    const accountId = getCanvasAccountId();
    const body = new URLSearchParams({
      'user[name]': input.name,
      'pseudonym[unique_id]': input.loginId,
      'pseudonym[password]': input.password,
      'pseudonym[send_confirmation]': 'false',
      'communication_channel[skip_confirmation]': 'true',
      'force_validations': 'true',
    });

    if (input.includeSisUserId && input.sisUserId) {
      body.set('user[sis_user_id]', input.sisUserId);
    }

    const result = await this.request<CanvasUser>(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/users`,
      {
        method: 'POST',
        body,
      }
    );

    return result.data;
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
