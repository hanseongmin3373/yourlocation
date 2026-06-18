-- 사용자 주소 확인(도로명 검증) 등록 (idempotent)
DO $$ BEGIN
  ALTER TABLE "IpLocationEntry" ADD COLUMN "userVerified" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "IpLocationEntry" ADD COLUMN "verifiedAt" TIMESTAMP(3);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;
