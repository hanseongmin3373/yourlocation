import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          로딩 중...
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
