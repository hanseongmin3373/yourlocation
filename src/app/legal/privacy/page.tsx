import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "YourLocation IP 위치 조회 서비스 개인정보 처리방침",
};

const EFFECTIVE_DATE = "2025년 6월 11일";

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="개인정보 처리방침" effectiveDate={EFFECTIVE_DATE}>
      <section>
        <h2 className="text-base font-bold text-slate-900">1. 개요</h2>
        <p className="mt-2">
          YourLocation(이하 &quot;서비스&quot;)은 IP 위치 조회 서비스를
          제공하며, 이용자의 개인정보를 관련 법령에 따라 안전하게
          처리합니다. 본 방침은 서비스가 수집·이용하는 개인정보의 범위와
          목적을 설명합니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          2. 수집하는 개인정보 항목
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <h3 className="font-semibold text-slate-800">회원 가입 시 (필수)</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>이메일 주소</li>
              <li>비밀번호 (암호화하여 저장)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">회원 가입 시 (선택)</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>이름</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">
              서비스 이용 시 (회원)
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>IP 조회·GPS 조회 이력 (조회 유형, 조회값, 결과 주소, 조회 일시)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">
              서비스 이용 시 (비회원)
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                접속 IP 주소 및 당일 조회 횟수 (일 10회 제한 목적, 조회 이력은
                저장하지 않음)
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          3. 개인정보의 수집·이용 목적
        </h2>
        <p className="mt-2 font-medium text-slate-800">
          수집한 개인정보는 아래 목적에만 이용하며, 그 외 다른 용도로 활용하지
          않습니다.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>회원 식별 및 로그인, 계정 관리</li>
          <li>
            <strong>회원의 IP·GPS 조회 이력 제공 및 저장</strong> (마이페이지
            조회 이력 기능)
          </li>
          <li>비회원 일일 조회 횟수 제한 (10회/일)</li>
          <li>서비스 운영, 장애 대응, 부정 이용 방지</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          4. 개인정보의 보유 및 이용 기간
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            회원 정보 및 조회 이력: 회원 탈퇴 시까지 보유 후 지체 없이 파기
          </li>
          <li>
            비회원 조회 횟수 기록: 해당 일자가 지나면 더 이상 이용하지 않으며,
            정기적으로 정리
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          5. 개인정보의 제3자 제공
        </h2>
        <p className="mt-2">
          서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.
          다만, 서비스 운영에 필요한 인프라(호스팅·데이터베이스) 제공 업체에
          저장·처리가 이루어질 수 있으며, 이 경우 관련 법령에 따른 보호 조치를
          준수합니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          6. 개인정보 처리 위탁
        </h2>
        <p className="mt-2">
          서비스 인프라 운영을 위해 클라우드 호스팅 및 데이터베이스 서비스를
          이용할 수 있습니다. 위탁 시 개인정보가 안전하게 관리되도록
          계약·관리 감독을 수행합니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          7. 이용자의 권리
        </h2>
        <p className="mt-2">
          이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리 정지를 요청할
          수 있습니다. 계정 및 조회 이력 삭제를 원하시면 서비스 운영자에게
          문의해 주세요.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          8. 개인정보 보호책임자
        </h2>
        <ul className="mt-2 list-none space-y-1">
          <li>서비스명: YourLocation (yourlocation.co.kr)</li>
          <li>문의: 서비스 내 문의 또는 운영자 이메일</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">9. 방침 변경</h2>
        <p className="mt-2">
          본 방침이 변경되는 경우 시행일 7일 전부터 서비스 내 공지합니다.
        </p>
        <p className="mt-2">시행일: {EFFECTIVE_DATE}</p>
      </section>
    </LegalPageLayout>
  );
}
