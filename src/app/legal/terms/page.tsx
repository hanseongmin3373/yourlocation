import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "이용약관",
  description: "YourLocation IP 위치 조회 서비스 이용약관",
};

const EFFECTIVE_DATE = "2025년 6월 11일";

export default function TermsPage() {
  return (
    <LegalPageLayout title="이용약관" effectiveDate={EFFECTIVE_DATE}>
      <section>
        <h2 className="text-base font-bold text-slate-900">제1조 (목적)</h2>
        <p className="mt-2">
          본 약관은 YourLocation(이하 &quot;서비스&quot;)이 제공하는 IP 위치
          조회 및 관련 부가 기능의 이용 조건과 절차, 회원과 서비스 운영자의
          권리·의무를 정함을 목적으로 합니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">제2조 (서비스 내용)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>IP 주소를 통한 위치 정보 조회</li>
          <li>GPS 기반 현재 위치 조회</li>
          <li>DNS 조회, Ping 테스트, ISP/호스팅 조회 등 네트워크 유틸리티</li>
          <li>
            회원 가입 시 IP·GPS 조회 이력 저장 및 조회 (비회원은 일일 조회
            횟수 제한 적용)
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">제3조 (회원가입)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            회원가입은 이용자가 본 약관 및 개인정보 처리방침에 동의하고
            가입 신청을 완료함으로써 성립합니다.
          </li>
          <li>
            회원은 정확한 이메일과 비밀번호를 제공해야 하며, 계정 정보 관리
            책임은 회원에게 있습니다.
          </li>
          <li>타인의 정보를 도용하여 가입해서는 안 됩니다.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          제4조 (이용자의 의무)
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>서비스를 불법적 목적이나 타인의 권리를 침해하는 방식으로 이용하지 않습니다.</li>
          <li>자동화 도구 등을 이용한 과도한 요청으로 서비스 운영을 방해하지 않습니다.</li>
          <li>조회 결과를 불법 추적·괴롭힘 등에 활용하지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">
          제5조 (서비스 제공 및 변경)
        </h2>
        <p className="mt-2">
          서비스는 연중무휴 제공을 원칙으로 하나, 시스템 점검·장애·외부 API
          장애 등 불가피한 사유로 일시 중단될 수 있습니다. 서비스 내용은
          운영상 필요에 따라 변경될 수 있으며, 중요한 변경은 사전에
          공지합니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">제6조 (면책)</h2>
        <p className="mt-2">
          IP·GPS 기반 위치 정보는 추정치이며 실제 위치와 차이가 있을 수
          있습니다. 서비스는 조회 결과의 정확성·완전성을 보장하지 않으며,
          이용자가 조회 결과를 활용하여 발생한 손해에 대해 법령상 허용되는
          범위 내에서 책임을 지지 않습니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">제7조 (약관 변경)</h2>
        <p className="mt-2">
          약관이 변경되는 경우 시행일 7일 전부터 서비스 내 공지합니다. 변경
          후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로
          봅니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">부칙</h2>
        <p className="mt-2">본 약관은 {EFFECTIVE_DATE}부터 시행합니다.</p>
      </section>
    </LegalPageLayout>
  );
}
