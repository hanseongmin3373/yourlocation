import { prisma } from "@/lib/db";
import { isUnlimitedUser, type SessionUser } from "@/lib/auth";
import { createMemoryCache } from "@/lib/memory-cache";

export const ANON_DAILY_LIMIT = 10;

const remainingCache = createMemoryCache<number>(15_000, 500);

function getKstDateString(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export async function getAnonymousRemaining(ip: string) {
  const cached = remainingCache.get(ip);
  if (cached !== undefined) return cached;

  const date = getKstDateString();
  const usage = await prisma.anonymousUsage.findUnique({
    where: { ip_date: { ip, date } },
  });
  const used = usage?.count ?? 0;
  const remaining = Math.max(0, ANON_DAILY_LIMIT - used);
  remainingCache.set(ip, remaining);
  return remaining;
}

export async function assertQueryAllowed(
  user: SessionUser | null,
  ip: string,
) {
  if (user && isUnlimitedUser(user)) {
    return {
      allowed: true,
      isMember: true,
      isPendingMember: false,
      remaining: null as number | null,
    };
  }

  const remaining = await getAnonymousRemaining(ip);
  if (remaining <= 0) {
    const error = user
      ? `승인 대기 중입니다. 관리자 승인 후 무제한 조회가 가능합니다. (비승인 회원·비회원 하루 ${ANON_DAILY_LIMIT}회)`
      : `비회원은 하루 ${ANON_DAILY_LIMIT}회까지 조회할 수 있습니다. 회원가입 후 관리자 승인을 받으면 무제한 이용할 수 있습니다.`;

    return {
      allowed: false,
      isMember: false,
      isPendingMember: !!user,
      remaining: 0,
      error,
    };
  }

  return {
    allowed: true,
    isMember: false,
    isPendingMember: !!user,
    remaining,
  };
}

interface RecordQueryInput {
  user: SessionUser | null;
  ip: string;
  queryType: string;
  queryValue: string;
  resultAddress?: string;
}

export async function recordQuery(input: RecordQueryInput) {
  const { user, ip, queryType, queryValue, resultAddress } = input;

  if (user && isUnlimitedUser(user)) {
    await prisma.queryLog.create({
      data: {
        userId: user.id,
        queryType,
        queryValue,
        resultAddress: resultAddress ?? null,
      },
    });
    return { remaining: null as number | null };
  }

  const date = getKstDateString();
  const usage = await prisma.anonymousUsage.upsert({
    where: { ip_date: { ip, date } },
    create: { ip, date, count: 1 },
    update: { count: { increment: 1 } },
  });

  remainingCache.set(ip, Math.max(0, ANON_DAILY_LIMIT - usage.count));

  return {
    remaining: Math.max(0, ANON_DAILY_LIMIT - usage.count),
  };
}

export async function getUserQueryLogs(userId: string, limit = 100) {
  return prisma.queryLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      queryType: true,
      queryValue: true,
      resultAddress: true,
      createdAt: true,
    },
  });
}

export async function getUserQueryCount(userId: string) {
  return prisma.queryLog.count({ where: { userId } });
}
