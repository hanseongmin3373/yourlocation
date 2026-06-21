import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCrowdStats } from "@/lib/crowd-ip-db";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ isApproved: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
        createdAt: true,
        _count: { select: { queries: true } },
      },
    });

    let crowdStats = null;
    try {
      crowdStats = await getCrowdStats();
    } catch (error) {
      console.error("admin crowd stats error", error);
    }

    return NextResponse.json({
      success: true,
      crowdStats,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        createdAt: user.createdAt.toISOString(),
        queryCount: user._count.queries,
      })),
    });
  } catch (error) {
    console.error("admin users list error", error);
    return NextResponse.json(
      { success: false, error: "회원 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      userId?: string;
      isApproved?: boolean;
    };

    if (!body.userId || typeof body.isApproved !== "boolean") {
      return NextResponse.json(
        { success: false, error: "userId와 isApproved가 필요합니다." },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, role: true },
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: "회원을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (target.role === "ADMIN" && !body.isApproved) {
      return NextResponse.json(
        { success: false, error: "관리자 계정의 승인은 해제할 수 없습니다." },
        { status: 400 },
      );
    }

    const updated = await prisma.user.update({
      where: { id: body.userId },
      data: { isApproved: body.isApproved },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("admin users patch error", error);
    return NextResponse.json(
      { success: false, error: "승인 상태 변경에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as { userId?: string };
    const userId = body.userId?.trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId가 필요합니다." },
        { status: 400 },
      );
    }

    if (userId === admin.id) {
      return NextResponse.json(
        { success: false, error: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: "회원을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (target.role === "ADMIN") {
      return NextResponse.json(
        { success: false, error: "관리자 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({
      success: true,
      deletedUserId: userId,
      email: target.email,
    });
  } catch (error) {
    console.error("admin users delete error", error);
    return NextResponse.json(
      { success: false, error: "회원 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
