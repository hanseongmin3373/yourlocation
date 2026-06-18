import { NextResponse } from "next/server";
import {
  applyAdminBootstrap,
  createSession,
  isValidEmail,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !isValidEmail(email) || !password) {
      return NextResponse.json(
        { success: false, error: "이메일과 비밀번호를 입력해주세요." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.password || !(await verifyPassword(password, user.password))) {
      if (user && !user.password) {
        return NextResponse.json(
          {
            success: false,
            error: "이 계정은 Google 로그인으로 가입되었습니다. Google로 로그인해주세요.",
          },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    await applyAdminBootstrap(user.id, user.email);

    const fresh = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
      },
    });

    await createSession(fresh);

    return NextResponse.json({
      success: true,
      user: fresh,
    });
  } catch (error) {
    console.error("login error", error);
    return NextResponse.json(
      { success: false, error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
