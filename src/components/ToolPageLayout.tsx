import Link from "next/link";
import Header from "@/components/Header";
import UtilityLinks from "@/components/UtilityLinks";

interface ToolPageLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  defaultIp?: string;
}

export default function ToolPageLayout({
  title,
  description,
  children,
  defaultIp,
}: ToolPageLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 space-y-2">
          <UtilityLinks ip={defaultIp} />
          <Link
            href="/"
            className="inline-block text-xs text-slate-500 hover:text-slate-700"
          >
            ← IP 위치 조회로 돌아가기
          </Link>
        </div>

        <section className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </section>

        {children}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} yourlocation.co.kr · IP 위치 조회 서비스
      </footer>
    </div>
  );
}
