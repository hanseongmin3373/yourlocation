import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createOAuthState,
  isGoogleAuthConfigured,
  storeOAuthState,
  type GoogleOAuthIntent,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google 로그인이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const intentParam = searchParams.get("intent");
  const intent: GoogleOAuthIntent =
    intentParam === "signup" ? "signup" : "login";
  const terms = searchParams.get("terms") === "1";
  const privacy = searchParams.get("privacy") === "1";

  const oauthState = createOAuthState(intent, terms, privacy);
  await storeOAuthState(oauthState);

  return NextResponse.redirect(buildGoogleAuthUrl(oauthState));
}
