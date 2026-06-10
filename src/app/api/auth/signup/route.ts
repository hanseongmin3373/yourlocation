import { NextResponse } from "next/server";
import {
  createSession,
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
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const name = body.name?.trim() || null;

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

    const user = await prisma.user.create({
      data: {
        email,
        password: await hashPassword(password),
        name,
      },
      select: { id: true, email: true, name: true },
    });

    await createSession(user);

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("signup error", error);
    return NextResponse.json(
      { success: false, error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
