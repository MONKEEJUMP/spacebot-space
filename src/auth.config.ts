import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';

export default {
  providers: [GitHub, Facebook, Google],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      return true; // Clerk handles auth now — allow all requests through NextAuth layer
    },
  },
} satisfies NextAuthConfig;
