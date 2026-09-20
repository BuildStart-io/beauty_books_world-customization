// Display names for plan tiers. DB values stay: free | pro | enterprise
export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Starter",
  enterprise: "Growth",
};

export function planLabel(tier?: string | null): string {
  if (!tier) return "Free";
  return PLAN_LABELS[tier] ?? tier;
}
