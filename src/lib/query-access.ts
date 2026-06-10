import { prisma } from "@/lib/db";

export const ANON_DAILY_LIMIT = 10;

function getKstDateString(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export async function getAnonymousRemaining(ip: string) {
  const date = getKstDateString();
  const usage = await prisma.anonymousUsage.findUnique({
    where: { ip_date: { ip, date } },
  });
  const used = usage?.count ?? 0;
  return Math.max(0, ANON_DAILY_LIMIT - used);
}

export async function assertQueryAllowed(userId: string | null, ip: string) {
  if (userId) {
    return {
      allowed: true,
      isMember: true,
      remaining: null as number | null,
    };
  }

  const remaining = await getAnonymousRemaining(ip);
  if (remaining <= 0) {
    return {
      allowed: false,
      isMember: false,
      remaining: 0,
      error: `비회원은 하루 ${ANON_DAILY_LIMIT}회까지 조회할 수 있습니다. 회원가입 후 무제한 이용하세요.`,
    };
  }

  return {
    allowed: true,
    isMember: false,
    remaining,
  };
}

interface RecordQueryInput {
  userId: string | null;
  ip: string;
  queryType: string;
  queryValue: string;
  resultAddress?: string;
}

export async function recordQuery(input: RecordQueryInput) {
  const { userId, ip, queryType, queryValue, resultAddress } = input;

  if (userId) {
    await prisma.queryLog.create({
      data: {
        userId,
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
