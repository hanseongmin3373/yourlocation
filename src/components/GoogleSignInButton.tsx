"use client";

type GoogleSignInButtonProps = {
  intent: "login" | "signup";
  termsAgreed?: boolean;
  privacyAgreed?: boolean;
  disabled?: boolean;
  onConsentError?: () => void;
};

export default function GoogleSignInButton({
  intent,
  termsAgreed = false,
  privacyAgreed = false,
  disabled = false,
  onConsentError,
}: GoogleSignInButtonProps) {
  function handleClick() {
    if (intent === "signup" && (!termsAgreed || !privacyAgreed)) {
      onConsentError?.();
      return;
    }

    const params = new URLSearchParams({ intent });
    if (termsAgreed) params.set("terms", "1");
    if (privacyAgreed) params.set("privacy", "1");
    window.location.href = `/api/auth/google?${params.toString()}`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
    >
      <GoogleIcon />
      Google로 {intent === "signup" ? "가입" : "로그인"}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.273 36 24 36c-7.18 0-13-5.82-13-13s5.82-13 13-13c3.31 0 6.28 1.25 8.54 3.29l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.31 0 6.28 1.25 8.54 3.29l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.248 0-9.612-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
