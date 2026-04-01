import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            allowDangerousEmailAccountLinking: true,
        }),
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email }
                });

                if (!user || !user.password) {
                    return null;
                }

                const isValid = await bcrypt.compare(credentials.password, user.password);

                if (!isValid) {
                    return null;
                }

                // Block unverified users — they must complete OTP before logging in.
                // NOTE: run `UPDATE "User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL`
                // in Supabase BEFORE deploying this change, or existing users will be locked out.
                if (user.emailVerified === null) {
                    return null;
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    newApiUserId: user.newApiUserId,
                };
            }
        })
    ],
    session: {
        strategy: "jwt",
    },
    debug: process.env.NODE_ENV === "development",
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.newApiUserId = (user as any).newApiUserId;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.id;
                (session.user as any).newApiUserId = token.newApiUserId;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
    secret: process.env.NEXTAUTH_SECRET,
    useSecureCookies: process.env.NEXTAUTH_URL?.startsWith('https://'),
    cookies: process.env.NEXTAUTH_URL?.startsWith('https://') ? {
        sessionToken: {
            name: '__Secure-next-auth.session-token',
            options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true }
        },
        callbackUrl: {
            name: '__Secure-next-auth.callback-url',
            options: { sameSite: 'lax', path: '/', secure: true }
        },
        csrfToken: {
            name: '__Host-next-auth.csrf-token',
            options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true }
        },
        pkceCodeVerifier: {
            name: '__Secure-next-auth.pkce.code_verifier',
            options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 }
        },
        state: {
            name: '__Secure-next-auth.state',
            options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 }
        },
        nonce: {
            name: '__Secure-next-auth.nonce',
            options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true }
        }
    } : undefined,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
