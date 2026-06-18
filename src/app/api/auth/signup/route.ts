import { NextResponse } from "next/server";
import {
  applyAdminBootstrap,
  createSession,
  getAdminEmails,
  hashPassword,
  isValidEmail,
  isValidPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      agreedToTerms?: boolean;
      agreedToPrivacy?: boolean;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const name = body.name?.trim() || null;

    if (!body.agreedToTerms || !body.agreedToPrivacy) {
      return NextResponse.json(
        {
          success: false,
          error: "이용약관 및 개인정보 처리방침에 동의해주세요.",
        },
        { status: 400 },
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "올바른 이메일을 입력해주세요." },
        { status: 400 },
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        { success: false, error: "비밀번호는 8자 이상이어야 합니다." },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "이미 가입된 이메일입니다." },
        { status: 409 },
      );
    }

    const agreedAt = new Date();
    const isAdminEmail = getAdminEmails().includes(email);
    const user = await prisma.user.create({
      data: {
        email,
        password: await hashPassword(password),
        name,
        termsAgreedAt: agreedAt,
        privacyAgreedAt: agreedAt,
        isApproved: isAdminEmail,
        role: isAdminEmail ? "ADMIN" : "USER",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
      },
    });

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

    return NextResponse.json({ success: true, user: fresh });
  } catch (error) {
    console.error("signup error", error);
    return NextResponse.json(
      { success: false, error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
