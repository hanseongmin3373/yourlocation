"use client";

interface CurrentLocationButtonProps {
  onLocate: () => void;
  loading?: boolean;
}

export default function CurrentLocationButton({
  onLocate,
  loading,
}: CurrentLocationButtonProps) {
  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.12-.698 20.285 20.285 0 002.828-2.118c2.688-2.688 4.094-5.696 4.094-8.86 0-5.352-4.375-9.708-9.739-9.708-5.365 0-9.739 4.356-9.739 9.708 0 3.164 1.406 6.172 4.094 8.86a20.285 20.285 0 002.828 2.118 16.975 16.975 0 001.12.698zm-1.54-10.351a3 3 0 100-6 3 3 0 000 6z"
          clipRule="evenodd"
        />
      </svg>
      {loading ? "위치 확인 중..." : "현재 위치 확인"}
    </button>
  );
}
