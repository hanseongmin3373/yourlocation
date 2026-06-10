"use client";

import { FormEvent, useEffect, useState } from "react";

interface IpSearchFormProps {
  defaultIp?: string;
  onSearch: (ip: string) => void;
  loading?: boolean;
}

export default function IpSearchForm({
  defaultIp = "",
  onSearch,
  loading,
}: IpSearchFormProps) {
  const [ip, setIp] = useState(defaultIp);

  useEffect(() => {
    if (defaultIp) setIp(defaultIp);
  }, [defaultIp]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (ip.trim()) onSearch(ip.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label htmlFor="ip-search" className="sr-only">
        IP 주소 검색
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ip-search"
          type="text"
          inputMode="decimal"
          placeholder="IP 주소를 입력하세요."
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !ip.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "조회 중..." : "주소검색"}
        </button>
      </div>
    </form>
  );
}
