"use client";

import Link from "next/link";

type SiteFooterProps = {
  onEraseData?: () => void;
};

export default function SiteFooter({ onEraseData }: SiteFooterProps) {
  return (
    <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link href="/legal/terms" className="hover:text-slate-600">
          이용약관
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/legal/privacy" className="hover:text-slate-600">
          개인정보 처리방침
        </Link>
        {onEraseData && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onEraseData}
              className="text-amber-700 hover:text-amber-900"
            >
              내 IP 등록 삭제
            </button>
          </>
        )}
      </div>
      <p>© {new Date().getFullYear()} yourlocation.co.kr · IP 위치 조회 서비스</p>
      <p className="mt-2">
        관리자 문의:{" "}
        <a
          href="mailto:yourlocation.co.kr@gmail.com"
          className="hover:text-slate-600"
        >
          yourlocation.co.kr@gmail.com
        </a>
      </p>
    </footer>
  );
}
