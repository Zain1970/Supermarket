export interface StoreAddonGrant {
  code: string;
  status: "PENDING_PAYMENT" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";
  startsAt: Date | null;
  endsAt: Date | null;
}

export type EntitlementDecision =
  | { enabled: true }
  | { enabled: false; reason: "NOT_PURCHASED" | "NOT_ACTIVE" | "NOT_STARTED" | "EXPIRED" };

export function decideAddonEntitlement(
  grants: readonly StoreAddonGrant[],
  addonCode: string,
  now: Date = new Date()
): EntitlementDecision {
  const grant = grants.find((item) => item.code === addonCode);

  if (!grant) return { enabled: false, reason: "NOT_PURCHASED" };
  if (grant.status !== "ACTIVE") return { enabled: false, reason: "NOT_ACTIVE" };
  if (grant.startsAt && grant.startsAt.getTime() > now.getTime()) {
    return { enabled: false, reason: "NOT_STARTED" };
  }
  if (grant.endsAt && grant.endsAt.getTime() <= now.getTime()) {
    return { enabled: false, reason: "EXPIRED" };
  }

  return { enabled: true };
}

/**
 * Call this policy in the server-side service layer for every protected add-on
 * operation. Hiding navigation in a client is not authorization.
 */
