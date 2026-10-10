import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import {
  OWNER_COOKIE,
  OWNER_SESSION_SECONDS,
  isOwnerIdentity,
  isOwnerToken,
} from "./owner-policy";

export const ownerAuthOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: { scope: "openid email profile", prompt: "select_account" },
      },
      checks: ["pkce", "state"],
    }),
  ],
  session: { strategy: "jwt", maxAge: OWNER_SESSION_SECONDS },
  jwt: { maxAge: OWNER_SESSION_SECONDS },
  useSecureCookies: true,
  cookies: {
    sessionToken: {
      name: OWNER_COOKIE,
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    },
    callbackUrl: {
      name: "__Secure-rockfoundry.callback-url",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    },
    csrfToken: {
      name: "__Host-rockfoundry.csrf-token",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    },
  },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      const google = profile as
        { sub?: string; email?: string; email_verified?: boolean } | undefined;
      return isOwnerIdentity({
        provider: account?.provider,
        sub: google?.sub,
        email: google?.email,
        verified: google?.email_verified,
      });
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const google = profile as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
        };
        if (
          !isOwnerIdentity({
            provider: account.provider,
            sub: google.sub,
            email: google.email,
            verified: google.email_verified,
          })
        )
          return {};
        token.email = google.email;
        token.googleSub = google.sub;
        token.googleVerified = true;
        token.ownerProvider = "google";
        token.ownerUntil =
          Math.floor(Date.now() / 1000) + OWNER_SESSION_SECONDS;
      }
      return token;
    },
    async session({ session, token }) {
      // No Google access/id/refresh tokens or credential configuration enters session JSON.
      session.user = isOwnerToken(token)
        ? { email: token.email || undefined, name: "Owner" }
        : undefined;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) return baseUrl + url;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        /* deny external callback */
      }
      return baseUrl + "/today";
    },
  },
  logger: {
    error(code) {
      console.error("Owner OAuth:", code);
    },
    warn(code) {
      console.warn("Owner OAuth:", code);
    },
    debug() {},
  },
};
