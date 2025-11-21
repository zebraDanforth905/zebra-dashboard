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
    console.log('getUser result:', {
      email,
      found: !!user[0],
      userType: user[0]?.user_type,
      userId: user[0]?.id,
    });
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
      // Attach user_type, id, and name from your DB user.
      if (user) {
        token.id = user.id;
        token.name = (user as any).name;
        token.user_type = (user as any).user_type;
        console.log('JWT callback - setting token:', {
          id: token.id,
          name: token.name,
          user_type: token.user_type,
          userObject: user,
        });
      }
      return token;
    },
    async session({ session, token }) {
      // Expose id, name, and user_type in session.user
      if (token) {
        (session.user as any).id = token.id;
        (session.user as any).name = token.name;
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
          console.log('Authorize - user lookup:', {
            email,
            userFound: !!user,
            userType: user?.user_type,
          });
          if (!user) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
 
          if (passwordsMatch) {
            console.log('Authorize - password match, returning user:', {
              id: user.id,
              email: user.email,
              user_type: user.user_type,
            });
            return user;
          }
        }
 
        console.log('Invalid credentials (auth.ts)');
        return null;
      },
    }),
  ],
});