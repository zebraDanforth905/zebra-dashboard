import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LOGIN_LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  isAccountLocked,
  isAdminUserType,
  isSessionVersionCurrent,
  nextFailedLoginState,
  normalizeSessionVersion,
} from '../app/lib/auth-security-rules.ts';

test('admin authorization is role based', () => {
  assert.equal(isAdminUserType('admin'), true);
  assert.equal(isAdminUserType('user'), false);
  assert.equal(isAdminUserType(undefined), false);
});

test('session versions must match exactly after normalization', () => {
  assert.equal(normalizeSessionVersion(undefined), 0);
  assert.equal(normalizeSessionVersion('2'), 2);
  assert.equal(isSessionVersionCurrent('3', 3), true);
  assert.equal(isSessionVersionCurrent(2, 3), false);
});

test('failed login state locks after threshold', () => {
  const now = new Date('2026-07-01T12:00:00.000Z');
  const beforeThreshold = nextFailedLoginState(MAX_FAILED_LOGIN_ATTEMPTS - 2, now);
  assert.equal(beforeThreshold.failedCount, MAX_FAILED_LOGIN_ATTEMPTS - 1);
  assert.equal(beforeThreshold.status, 'active');
  assert.equal(beforeThreshold.lockedUntil, null);

  const locked = nextFailedLoginState(MAX_FAILED_LOGIN_ATTEMPTS - 1, now);
  assert.equal(locked.failedCount, MAX_FAILED_LOGIN_ATTEMPTS);
  assert.equal(locked.status, 'locked');
  assert.equal(
    locked.lockedUntil?.toISOString(),
    new Date(now.getTime() + LOGIN_LOCKOUT_MINUTES * 60 * 1000).toISOString()
  );
});

test('locked and disabled accounts are rejected', () => {
  const now = new Date('2026-07-01T12:00:00.000Z');
  assert.equal(isAccountLocked({ status: 'disabled', now }), true);
  assert.equal(isAccountLocked({ status: 'locked', lockedUntil: '2026-07-01T12:14:00.000Z', now }), true);
  assert.equal(isAccountLocked({ status: 'locked', lockedUntil: '2026-07-01T11:59:00.000Z', now }), false);
});

test('admin middleware returns 403 for non-admin access', () => {
  const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
  assert.match(middleware, /pathname\.startsWith\('\/dashboard\/admin'\)/);
  assert.match(middleware, /status:\s*403/);
  assert.match(middleware, /isCurrentAdminToken/);
});

test('auth implementation does not log credential metadata', () => {
  const auth = readFileSync(new URL('../auth.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(auth, /console\.log/);
  assert.match(auth, /recordLoginAttempt/);
  assert.match(auth, /session_version/);
});

test('admin login management migration includes required tables and session version', () => {
  const migration = readFileSync(new URL('../migrations/040_admin_login_management.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS login_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_audit_log/);
  assert.match(migration, /session_version INTEGER/);
  assert.match(migration, /failed_login_count INTEGER/);
});
