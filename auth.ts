import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import {
  authUserForSession,
  extractClientIp,
  getUserForCredentials,
  recordLoginAttempt,
} from '@/app/lib/auth-security';
import { isAccountLocked, normalizeSessionVersion } from '@/app/lib/auth-security-rules';

export const runtime = 'nodejs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = (user as any).name;
        token.user_type = (user as any).user_type;
        token.session_version = normalizeSessionVersion((user as any).session_version);
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any).id = token.id;
        (session.user as any).name = token.name;
        (session.user as any).user_type = token.user_type;
        (session.user as any).session_version = token.session_version;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (!parsedCredentials.success) return null;

        const { email, password } = parsedCredentials.data;
        const ipAddress = extractClientIp(request);
        const user = await getUserForCredentials(email);

        if (!user) {
          await recordLoginAttempt({
            attemptedEmail: email,
            ipAddress,
            success: false,
            failureReason: 'unknown_user',
          });
          return null;
        }

        if (isAccountLocked({ status: user.status, lockedUntil: user.locked_until })) {
          await recordLoginAttempt({
            user,
            attemptedEmail: email,
            ipAddress,
            success: false,
            failureReason: user.status === 'disabled' ? 'disabled' : 'locked',
          });
          return null;
        }

        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) {
          await recordLoginAttempt({
            user,
            attemptedEmail: email,
            ipAddress,
            success: false,
            failureReason: 'bad_password',
          });
          return null;
        }

        await recordLoginAttempt({
          user,
          attemptedEmail: email,
          ipAddress,
          success: true,
        });
        return authUserForSession(user);
      },
    }),
  ],
});
