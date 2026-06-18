import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          로딩 중...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
