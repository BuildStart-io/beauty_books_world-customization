import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useFcmToken() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const url = new URL(window.location.href);
    const fcmToken = url.searchParams.get("fcm_token");

    if (!fcmToken) return;

    // Remove token from URL to keep it clean
    url.searchParams.delete("fcm_token");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);

    // Upsert the token
    const saveToken = async () => {
      const deviceName = navigator.userAgent.slice(0, 100);

      await supabase
        .from("fcm_tokens")
        .upsert(
          {
            user_id: user.id,
            device_token: fcmToken,
            device_name: deviceName,
          },
          { onConflict: "user_id,device_token" }
        );
    };

    saveToken();
  }, [user]);
}
