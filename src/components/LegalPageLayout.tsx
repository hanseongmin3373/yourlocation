import Link from "next/link";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";

interface LegalPageLayoutProps {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}

export default function LegalPageLayout({
  title,
  effectiveDate,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="inline-block text-xs text-slate-500 hover:text-slate-700"
        >
          ← 홈으로
        </Link>

        <header className="mt-4 border-b border-slate-200 pb-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">시행일: {effectiveDate}</p>
        </header>

        <article className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
