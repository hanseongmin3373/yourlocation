import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  applyAdminBootstrap,
  createSession,
  getAdminEmails,
  type SessionUser,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

const OAUTH_STATE_COOKIE = "yl_google_oauth";
const OAUTH_STATE_MAX_AGE = 600;

export type GoogleOAuthIntent = "login" | "signup";

export type GoogleOAuthState = {
  state: string;
  intent: GoogleOAuthIntent;
  terms: boolean;
  privacy: boolean;
};

export type GoogleUserProfile = {
  sub: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
};

function getGoogleClientId() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) {
    throw new Error("GOOGLE_CLIENT_ID 환경 변수가 설정되지 않았습니다.");
  }
  return id;
}

function getGoogleClientSecret() {
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new Error("GOOGLE_CLIENT_SECRET 환경 변수가 설정되지 않았습니다.");
  }
  return secret;
}

export function isGoogleAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function getAppOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export function getGoogleRedirectUri() {
  return `${getAppOrigin()}/api/auth/google/callback`;
}

export async function storeOAuthState(payload: GoogleOAuthState) {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE,
  });
}

export async function consumeOAuthState(
  state: string,
): Promise<GoogleOAuthState | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GoogleOAuthState;
    if (parsed.state !== state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createOAuthState(
  intent: GoogleOAuthIntent,
  terms: boolean,
  privacy: boolean,
): GoogleOAuthState {
  return {
    state: randomBytes(24).toString("hex"),
    intent,
    terms,
    privacy,
  };
}

export function buildGoogleAuthUrl(oauthState: GoogleOAuthState) {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: oauthState.state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error("Google 토큰 교환에 실패했습니다.");
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Google 액세스 토큰을 받지 못했습니다.");
  }
  return json.access_token;
}

export async function fetchGoogleUserProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Google 사용자 정보를 가져오지 못했습니다.");
  }

  const json = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    email_verified?: boolean;
  };

  if (!json.sub || !json.email) {
    throw new Error("Google 계정 이메일을 확인할 수 없습니다.");
  }

  return {
    sub: json.sub,
    email: json.email.trim().toLowerCase(),
    name: json.name?.trim() || null,
    emailVerified: Boolean(json.email_verified),
  };
}

export async function exchangeGoogleCode(
  code: string,
): Promise<GoogleUserProfile> {
  const accessToken = await exchangeCodeForTokens(code);
  return fetchGoogleUserProfile(accessToken);
}

const sessionSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isApproved: true,
} as const;

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public code:
      | "consent_required"
      | "email_unverified"
      | "account_exists"
      | "unknown",
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export async function resolveGoogleUser(
  profile: GoogleUserProfile,
  oauthState: GoogleOAuthState,
): Promise<SessionUser> {
  if (!profile.emailVerified) {
    throw new GoogleAuthError(
      "Google 이메일 인증이 완료되지 않은 계정입니다.",
      "email_unverified",
    );
  }

  const email = profile.email;
  const googleId = profile.sub;

  const user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
    select: {
      ...sessionSelect,
      googleId: true,
      password: true,
    },
  });

  if (user) {
    if (!user.googleId) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          name: user.name || profile.name,
        },
      });
    } else if (!user.name && profile.name) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: profile.name },
      });
    }
  } else {
    const needsConsent =
      oauthState.intent === "signup" &&
      (!oauthState.terms || !oauthState.privacy);

    if (needsConsent) {
      throw new GoogleAuthError(
        "회원가입 시 이용약관 및 개인정보 처리방침에 동의해주세요.",
        "consent_required",
      );
    }

    const agreedAt = new Date();
    const isAdminEmail = getAdminEmails().includes(email);
    await prisma.user.create({
      data: {
        email,
        googleId,
        name: profile.name,
        password: null,
        termsAgreedAt: agreedAt,
        privacyAgreedAt: agreedAt,
        isApproved: isAdminEmail,
        role: isAdminEmail ? "ADMIN" : "USER",
      },
    });
  }

  const fresh = await prisma.user.findFirstOrThrow({
    where: { OR: [{ googleId }, { email }] },
    select: sessionSelect,
  });

  await applyAdminBootstrap(fresh.id, fresh.email);

  return prisma.user.findUniqueOrThrow({
    where: { id: fresh.id },
    select: sessionSelect,
  });
}

export async function signInWithGoogle(
  profile: GoogleUserProfile,
  oauthState: GoogleOAuthState,
) {
  const user = await resolveGoogleUser(profile, oauthState);
  await createSession(user);
  return user;
}
