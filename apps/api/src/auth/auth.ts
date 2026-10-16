import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedPrincipal, StoreRole } from "../security/access-control.js";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-supermarket_session"
    : "supermarket_session";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const authenticate: RequestHandler = async (request, response, next) => {
  try {
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!token || token.length > 256) {
      response.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "يرجى تسجيل الدخول للمتابعة." }
      });
      return;
    }

    const tokenHash = hashSessionToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
            isPlatformAdmin: true,
            memberships: {
              select: {
                storeId: true,
                role: true,
                store: { select: { status: true } }
              }
            }
          }
        }
      }
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      response.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
      response.status(401).json({
        error: { code: "SESSION_INVALID", message: "انتهت الجلسة أو لم تعد صالحة. سجّل الدخول مجددًا." }
      });
      return;
    }

    const memberships = session.user.memberships
      .filter((membership) => membership.store.status !== "ARCHIVED")
      .map((membership) => ({
        storeId: membership.storeId,
        role: membership.role as StoreRole
      }));

    const principal: AuthenticatedPrincipal = {
      userId: session.user.id,
      isPlatformAdmin: session.user.isPlatformAdmin,
      memberships
    };

    request.principal = principal;
    request.sessionTokenHash = tokenHash;
    next();
  } catch (error) {
    next(error);
  }
};

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/"
  };
}
