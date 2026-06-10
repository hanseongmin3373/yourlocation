interface IpBannerProps {
  ip: string;
}

export default function IpBanner({ ip }: IpBannerProps) {
  return (
    <p className="text-sm text-slate-800 sm:text-base">
      접속하신 외부 IP 주소는{" "}
      <strong className="text-lg font-bold text-emerald-800 sm:text-xl">
        {ip}
      </strong>{" "}
      입니다
    </p>
  );
}
