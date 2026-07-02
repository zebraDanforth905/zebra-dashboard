export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

export type AccountStatus = 'active' | 'locked' | 'disabled';

export function isAdminUserType(userType: unknown) {
  return userType === 'admin';
}

export function normalizeSessionVersion(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function isSessionVersionCurrent(tokenVersion: unknown, currentVersion: unknown) {
  return normalizeSessionVersion(tokenVersion) === normalizeSessionVersion(currentVersion);
}

export function isAccountLocked(params: {
  status?: string | null;
  lockedUntil?: Date | string | null;
  now?: Date;
}) {
  if (params.status === 'disabled') return true;

  const lockedUntil = params.lockedUntil ? new Date(params.lockedUntil) : null;
  if (!lockedUntil || Number.isNaN(lockedUntil.getTime())) return false;

  return lockedUntil.getTime() > (params.now ?? new Date()).getTime();
}

export function nextFailedLoginState(
  currentFailedCount: number | null | undefined,
  now = new Date()
) {
  const failedCount = Math.max(0, Number(currentFailedCount ?? 0)) + 1;
  const shouldLock = failedCount >= MAX_FAILED_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + LOGIN_LOCKOUT_MINUTES * 60 * 1000)
    : null;

  return {
    failedCount,
    status: shouldLock ? 'locked' as AccountStatus : 'active' as AccountStatus,
    lockedUntil,
  };
}
