import Link from "next/link";

const tools = [
  { href: "/dns", label: "DNS 조회" },
  { href: "/ping", label: "Ping 테스트" },
  { href: "/isp", label: "ISP/호스팅 조회" },
] as const;

interface UtilityLinksProps {
  ip?: string;
}

export default function UtilityLinks({ ip }: UtilityLinksProps) {
  return (
    <nav
      aria-label="네트워크 도구"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
    >
      {tools.map(({ href, label }) => (
        <Link
          key={href}
          href={ip ? `${href}?ip=${encodeURIComponent(ip)}` : href}
          className="font-medium text-emerald-700 transition hover:text-emerald-900 hover:underline"
        >
          [{label}]
        </Link>
      ))}
    </nav>
  );
}
