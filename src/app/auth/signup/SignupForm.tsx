"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          agreedToTerms,
          agreedToPrivacy,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "회원가입에 실패했습니다.");
      }

      router.push("/my");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">회원가입</h1>
        <p className="mt-2 text-sm text-slate-500">
          가입 후 <strong>관리자 승인</strong>을 받으면 IP 조회 무제한 및 조회
          이력 저장이 가능합니다.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <fieldset className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <legend className="px-1 text-sm font-medium text-slate-800">
              약관 동의 (Google 가입 시 필수)
            </legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <Link
                  href="/legal/terms"
                  target="_blank"
                  className="font-medium text-blue-600 hover:underline"
                >
                  이용약관
                </Link>
                에 동의합니다.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={agreedToPrivacy}
                onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <Link
                  href="/legal/privacy"
                  target="_blank"
                  className="font-medium text-blue-600 hover:underline"
                >
                  개인정보 처리방침
                </Link>
                에 동의합니다.
              </span>
            </label>
          </fieldset>

          <GoogleSignInButton
            intent="signup"
            termsAgreed={agreedToTerms}
            privacyAgreed={agreedToPrivacy}
            disabled={loading}
            onConsentError={() =>
              setError("Google 가입 전 이용약관 및 개인정보 처리방침에 동의해주세요.")
            }
          />

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">또는</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                이름 (선택)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                이메일
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium"
              >
                비밀번호 (8자 이상)
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !agreedToTerms || !agreedToPrivacy}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "가입 중..." : "이메일로 회원가입"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{" "}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:underline">
            로그인
          </Link>
        </p>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <Link href="/legal/terms" className="hover:text-slate-600">
          이용약관
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/privacy" className="hover:text-slate-600">
          개인정보 처리방침
        </Link>
      </footer>
    </div>
  );
}
