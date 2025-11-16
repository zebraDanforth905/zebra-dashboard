import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';
import postgres from 'postgres';


export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
 
async function getUser(email: string): Promise<User | undefined> {
  try {
    const user = await sql<User[]>`SELECT * FROM users WHERE email=${email}`;
    return user[0];
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}
 
export const { auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, user }) {
      // When the user logs in, `user` will be populated.
      // Attach user_type from your DB user.
      if (user) {
        // adjust property name to match your user object
        token.user_type = (user as any).user_type;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose user_type in session.user so it's accessible as req.auth.user.user_type
      if (token?.user_type) {
        (session.user as any).user_type = token.user_type;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);
 
        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await getUser(email);
          if (!user) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
 
          if (passwordsMatch) return user;
        }
 
        console.log('Invalid credentials (auth.ts)');
        return null;
      },
    }),
  ],
});