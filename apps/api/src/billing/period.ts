export type SupportedBillingCycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

export function periodEnd(start: Date, cycle: SupportedBillingCycle): Date {
  const months = cycle === "MONTHLY" ? 1 : cycle === "QUARTERLY" ? 3 : 12;
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}
