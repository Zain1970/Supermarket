import type { RequestHandler } from "express";

export const requirePlatformAdmin: RequestHandler = (request, response, next) => {
  if (!request.principal) {
    response.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "يرجى تسجيل الدخول للمتابعة." }
    });
    return;
  }

  if (!request.principal.isPlatformAdmin) {
    response.status(403).json({
      error: { code: "PLATFORM_ADMIN_REQUIRED", message: "هذه العملية متاحة لمسؤول المنصة فقط." }
    });
    return;
  }

  next();
};
