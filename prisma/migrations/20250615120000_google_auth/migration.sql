-- Google OAuth: 비밀번호 선택, Google ID 연동 (idempotent)
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
