import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      setRoleLoading(true);
      return;
    }

    if (!user) {
      setIsSuperAdmin(false);
      setRoleLoading(false);
      return;
    }

    const checkRole = async () => {
      setRoleLoading(true);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      setIsSuperAdmin(!!data);
      setRoleLoading(false);
    };

    checkRole();
  }, [user, authLoading]);

  return { isSuperAdmin, roleLoading };
}
