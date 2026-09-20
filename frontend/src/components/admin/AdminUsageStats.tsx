import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Activity } from "lucide-react";

interface Props {
  userId: string;
  profile: any;
}

function cycleStart(billingCycleStart: string | null | undefined): string {
  if (!billingCycleStart) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const now = new Date();
  const current = new Date(billingCycleStart);
  while (true) {
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1);
    if (next > now) break;
    current.setTime(next.getTime());
  }
  return current.toISOString();
}

export default function AdminUsageStats({ userId, profile }: Props) {
  const [contacts, setContacts] = useState<number | null>(null);
  const [aiMessages, setAiMessages] = useState<number | null>(null);

  useEffect(() => {
    const since = cycleStart(profile?.billing_cycle_start);
    const load = async () => {
      const [c, a] = await Promise.all([
        supabase.rpc("get_contact_usage" as any, { _user_id: userId, _since: since } as any),
        supabase.rpc("get_ai_message_usage" as any, { _user_id: userId, _since: since } as any),
      ]);
      setContacts((c as any)?.data ?? 0);
      setAiMessages((a as any)?.data ?? 0);
    };
    load();
  }, [userId, profile?.billing_cycle_start]);

  const avg = contacts && aiMessages !== null ? (aiMessages / contacts).toFixed(1) : "0.0";

  const cards = [
    { label: "Contacts (this cycle)", value: contacts ?? "…", icon: Users },
    { label: "AI Messages (this cycle)", value: aiMessages ?? "…", icon: MessageSquare },
    { label: "Avg AI Msgs / Contact", value: avg, icon: Activity },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
            <c.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
