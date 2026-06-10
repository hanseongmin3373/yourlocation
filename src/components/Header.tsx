import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
            YL
          </span>
          <div>
            <p className="text-base font-bold text-slate-900">YourLocation</p>
            <p className="text-xs text-slate-500">IP 위치 조회 서비스</p>
          </div>
        </Link>
        <p className="hidden text-xs text-slate-400 sm:block">yourlocation.co.kr</p>
      </div>
    </header>
  );
}
