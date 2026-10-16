import { randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import cookieParser from "cookie-parser";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, cookieOptions, hashSessionToken, SESSION_COOKIE_NAME } from "./auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "LOGIN_RATE_LIMITED",
      message: "محاولات تسجيل الدخول كثيرة. انتظر قليلًا ثم حاول مجددًا."
    }
  }
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200)
});

authRouter.use(cookieParser());

authRouter.post("/login", loginLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: { code: "INVALID_INPUT", message: "تحقق من البريد الإلكتروني وكلمة المرور." }
      });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, displayName: true, isActive: true }
    });

    // Use the same public response for unknown and inactive users to reduce account enumeration.
    const passwordMatches = user
      ? await compare(parsed.data.password, user.passwordHash)
      : false;

    if (!user || !user.isActive || !passwordMatches) {
      response.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "بيانات تسجيل الدخول غير صحيحة." }
      });
      return;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { userId: user.id, tokenHash, expiresAt }
    });

    response.cookie(SESSION_COOKIE_NAME, rawToken, {
      ...cookieOptions(),
      expires: expiresAt
    });

    response.status(200).json({
      user: { id: user.id, displayName: user.displayName },
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (request, response) => {
  response.status(200).json({
    userId: request.principal?.userId,
    memberships: request.principal?.memberships ?? [],
    isPlatformAdmin: request.principal?.isPlatformAdmin ?? false
  });
});

authRouter.post("/logout", authenticate, async (request, response, next) => {
  try {
    if (request.sessionTokenHash) {
      await prisma.session.updateMany({
        where: { tokenHash: request.sessionTokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    response.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});
