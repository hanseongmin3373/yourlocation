import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  exchangeGoogleCode,
  getAppOrigin,
  GoogleAuthError,
  signInWithGoogle,
} from "@/lib/google-auth";

function redirectWithError(path: string, message: string) {
  const url = new URL(path, getAppOrigin());
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const googleError = searchParams.get("error");

  if (googleError) {
    return redirectWithError(
      "/auth/login",
      "Google 로그인이 취소되었습니다.",
    );
  }

  if (!code || !state) {
    return redirectWithError(
      "/auth/login",
      "Google 로그인 요청이 올바르지 않습니다.",
    );
  }

  const oauthState = await consumeOAuthState(state);
  if (!oauthState) {
    return redirectWithError(
      "/auth/login",
      "로그인 세션이 만료되었습니다. 다시 시도해주세요.",
    );
  }

  try {
    const profile = await exchangeGoogleCode(code);
    await signInWithGoogle(profile, oauthState);
    return NextResponse.redirect(new URL("/my", getAppOrigin()));
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      const path =
        error.code === "consent_required" ? "/auth/signup" : "/auth/login";
      return redirectWithError(path, error.message);
    }

    console.error("google callback error", error);
    return redirectWithError(
      "/auth/login",
      "Google 로그인 처리 중 오류가 발생했습니다.",
    );
  }
}
