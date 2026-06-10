"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<{
    email: string;
    name: string | null;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.user) setUser(json.user);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  if (!loaded) {
    return <div className="h-8 w-24" aria-hidden />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/my"
          className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
        >
          내 이력
        </Link>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Link
        href="/auth/login"
        className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
      >
        로그인
      </Link>
      <Link
        href="/auth/signup"
        className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
      >
        회원가입
      </Link>
    </div>
  );
}
