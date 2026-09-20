import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface StaffAccess {
  isStaff: boolean;
  ownerId: string | null;
  permissions: string[];
  loading: boolean;
  /** The effective user_id for data queries (owner_id if staff, own id if owner) */
  effectiveUserId: string | null;
  hasPermission: (tab: string) => boolean;
}

export function useStaffAccess(): StaffAccess {
  const { user } = useAuth();
  const [isStaff, setIsStaff] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("staff_accounts")
          .select("owner_id, permissions, is_active")
          .eq("staff_user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (data && !error) {
          setIsStaff(true);
          setOwnerId(data.owner_id);
          setPermissions((data.permissions as string[]) || []);
        } else {
          setIsStaff(false);
          setOwnerId(null);
          setPermissions([]);
        }
      } catch {
        setIsStaff(false);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user]);

  const effectiveUserId = isStaff ? ownerId : user?.id || null;

  const hasPermission = (tab: string) => {
    if (!isStaff) return true; // owners have all permissions
    return permissions.includes(tab);
  };

  return { isStaff, ownerId, permissions, loading, effectiveUserId, hasPermission };
}
