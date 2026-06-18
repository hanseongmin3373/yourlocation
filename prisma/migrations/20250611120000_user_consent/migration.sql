-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAgreedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "privacyAgreedAt" TIMESTAMP(3);

UPDATE "User" SET "termsAgreedAt" = "createdAt", "privacyAgreedAt" = "createdAt" WHERE "termsAgreedAt" IS NULL;

ALTER TABLE "User" ALTER COLUMN "termsAgreedAt" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "privacyAgreedAt" SET NOT NULL;
