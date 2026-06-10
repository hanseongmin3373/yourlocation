import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://yourlocation.co.kr";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "YourLocation - IP 위치 조회 | yourlocation.co.kr",
    template: "%s | YourLocation",
  },
  description:
    "IP 주소로 위치를 조회하고 위도·경도, 주소, 카카오맵으로 확인하세요. 현재 접속 IP 자동 확인 및 모바일 최적화 IP 위치 추적 서비스.",
  keywords: [
    "IP 위치",
    "IP 조회",
    "IP 추적",
    "위치 조회",
    "IP 주소",
    "내 IP",
    "IP geolocation",
    "yourlocation",
  ],
  authors: [{ name: "YourLocation", url: siteUrl }],
  creator: "YourLocation",
  publisher: "YourLocation",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: siteUrl,
    siteName: "YourLocation",
    title: "YourLocation - IP 위치 조회",
    description:
      "IP 주소로 위치를 조회하고 위도·경도, 주소, 카카오맵으로 확인하세요.",
  },
  twitter: {
    card: "summary_large_image",
    title: "YourLocation - IP 위치 조회",
    description:
      "IP 주소로 위치를 조회하고 위도·경도, 주소, 카카오맵으로 확인하세요.",
  },
  alternates: {
    canonical: siteUrl,
  },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2563eb",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "YourLocation",
  url: siteUrl,
  description:
    "IP 주소로 위치를 조회하고 위도·경도, 주소, 카카오맵으로 확인하는 무료 IP 위치 조회 서비스",
  applicationCategory: "UtilityApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
  },
  inLanguage: "ko-KR",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
