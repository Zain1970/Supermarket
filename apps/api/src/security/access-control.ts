export type StoreRole =
  | "PLATFORM_ADMIN"
  | "STORE_OWNER"
  | "STORE_MANAGER"
  | "CASHIER"
  | "INVENTORY_STAFF"
  | "PURCHASING_STAFF"
  | "CUSTOMER";

export interface StoreMembershipContext {
  storeId: string;
  role: StoreRole;
}

export interface AuthenticatedPrincipal {
  userId: string;
  isPlatformAdmin: boolean;
  memberships: readonly StoreMembershipContext[];
}

export type AccessDecision =
  | { allowed: true; role: StoreRole | "PLATFORM_ADMIN" }
  | { allowed: false; reason: "UNAUTHENTICATED" | "STORE_ACCESS_DENIED" | "ROLE_NOT_ALLOWED" };

export function decideStoreAccess(
  principal: AuthenticatedPrincipal | null | undefined,
  requestedStoreId: string,
  allowedRoles?: readonly StoreRole[]
): AccessDecision {
  if (!principal?.userId) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  if (principal.isPlatformAdmin) {
    return { allowed: true, role: "PLATFORM_ADMIN" };
  }

  const membership = principal.memberships.find(
    (item) => item.storeId === requestedStoreId
  );

  if (!membership) {
    return { allowed: false, reason: "STORE_ACCESS_DENIED" };
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    return { allowed: false, reason: "ROLE_NOT_ALLOWED" };
  }

  return { allowed: true, role: membership.role };
}

/**
 * Security contract: this function must receive a principal built by verified
 * server-side authentication and memberships loaded from the database. Never
 * construct it from user-controlled headers or request body fields.
 */
