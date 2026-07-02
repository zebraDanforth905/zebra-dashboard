import postgres from 'postgres';
import {
  isAccountLocked,
  isAdminUserType,
  isSessionVersionCurrent,
  nextFailedLoginState,
  normalizeSessionVersion,
} from './auth-security-rules';

type SqlClient = ReturnType<typeof postgres>;

let sqlClient: SqlClient | null = null;

function sql() {
  if (!sqlClient) {
    sqlClient = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
  }
  return sqlClient;
}

export type AuthUserRow = {
  id: string;
  name: string;
  email: string;
  password: string;
  user_type: string;
  status: string | null;
  last_login_at: Date | null;
  login_count: number | null;
  failed_login_count: number | null;
  locked_until: Date | null;
  session_version: number | null;
};

export type AuthTokenLike = {
  id?: unknown;
  user_type?: unknown;
  session_version?: unknown;
};

export function extractClientIp(request?: Request) {
  if (!request) return null;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
  return request.headers.get('x-real-ip') ?? null;
}

export async function getUserForCredentials(email: string) {
  const rows = await sql()<AuthUserRow[]>`
    SELECT
      id::text,
      name,
      email,
      password,
      user_type,
      COALESCE(status, 'active') AS status,
      last_login_at,
      COALESCE(login_count, 0)::int AS login_count,
      COALESCE(failed_login_count, 0)::int AS failed_login_count,
      locked_until,
      COALESCE(session_version, 0)::int AS session_version
    FROM users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `;

  return rows[0];
}

export async function recordLoginAttempt(params: {
  user?: Pick<AuthUserRow, 'id' | 'email' | 'failed_login_count'> | null;
  attemptedEmail: string;
  ipAddress: string | null;
  success: boolean;
  failureReason?: string | null;
}) {
  await sql()`
    INSERT INTO login_events (user_id, attempted_email, ip_address, success, failure_reason)
    VALUES (
      ${params.user?.id ?? null}::uuid,
      ${params.attemptedEmail},
      ${params.ipAddress},
      ${params.success},
      ${params.failureReason ?? null}
    )
  `;

  if (!params.user) return;

  if (params.success) {
    await sql()`
      UPDATE users
      SET last_login_at = NOW(),
          login_count = COALESCE(login_count, 0) + 1,
          failed_login_count = 0,
          locked_until = NULL,
          status = CASE WHEN status = 'locked' THEN 'active' ELSE COALESCE(status, 'active') END
      WHERE id = ${params.user.id}::uuid
    `;
    return;
  }

  const next = nextFailedLoginState(params.user.failed_login_count);
  await sql()`
    UPDATE users
    SET failed_login_count = ${next.failedCount},
        locked_until = ${next.lockedUntil},
        status = ${next.status}
    WHERE id = ${params.user.id}::uuid
  `;
}

export async function isTokenSessionCurrent(token: AuthTokenLike | null | undefined) {
  const userId = typeof token?.id === 'string' ? token.id : null;
  if (!userId) return false;
  const tokenSessionVersion = token?.session_version;

  const rows = await sql()<Array<{
    user_type: string;
    status: string | null;
    locked_until: Date | null;
    session_version: number | null;
  }>>`
    SELECT
      user_type,
      COALESCE(status, 'active') AS status,
      locked_until,
      COALESCE(session_version, 0)::int AS session_version
    FROM users
    WHERE id = ${userId}::uuid
    LIMIT 1
  `;

  const user = rows[0];
  if (!user) return false;
  if (isAccountLocked({ status: user.status, lockedUntil: user.locked_until })) return false;

  return isSessionVersionCurrent(tokenSessionVersion, user.session_version);
}

export async function isCurrentAdminToken(token: AuthTokenLike | null | undefined) {
  return isAdminUserType(token?.user_type) && await isTokenSessionCurrent(token);
}

export async function writeAdminAuditLog(params: {
  adminId: string;
  targetUserId?: string | null;
  action: string;
  metadata?: unknown;
}) {
  await sql()`
    INSERT INTO admin_audit_log (admin_id, target_user_id, action, metadata)
    VALUES (
      ${params.adminId}::uuid,
      ${params.targetUserId ?? null}::uuid,
      ${params.action},
      ${JSON.stringify(params.metadata ?? {})}::jsonb
    )
  `;
}

export function authUserForSession(user: AuthUserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    user_type: user.user_type,
    session_version: normalizeSessionVersion(user.session_version),
  };
}
