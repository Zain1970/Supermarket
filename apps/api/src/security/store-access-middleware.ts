import type { Request, RequestHandler } from "express";
import { decideStoreAccess, type AuthenticatedPrincipal, type StoreRole } from "./access-control.js";

export type PrincipalResolver = (
  request: Request
) => AuthenticatedPrincipal | null | undefined;

/**
 * Creates a store-scoped authorization middleware. The principal resolver must
 * return identity and memberships from the verified server-side session.
 */
export function requireStoreAccess(
  resolvePrincipal: PrincipalResolver = (request) => request.principal,
  allowedRoles?: readonly StoreRole[]
): RequestHandler {
  return (request, response, next) => {
    const storeId = request.params.storeId;
    if (!storeId) {
      response.status(400).json({
        error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." }
      });
      return;
    }

    const decision = decideStoreAccess(resolvePrincipal(request), storeId, allowedRoles);

    if (!decision.allowed) {
      const unauthenticated = decision.reason === "UNAUTHENTICATED";
      response.status(unauthenticated ? 401 : 403).json({
        error: {
          code: decision.reason,
          message: unauthenticated
            ? "يرجى تسجيل الدخول للمتابعة."
            : "ليست لديك صلاحية الوصول إلى هذا المتجر."
        }
      });
      return;
    }

    response.locals.storeAccess = { storeId, userRole: decision.role };
    next();
  };
}
