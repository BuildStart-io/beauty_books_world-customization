import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Checking session...");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setStatus("Connecting to Supabase...");
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          setStatus(`Auth error: ${error.message}`);
          return;
        }
        setStatus(session ? "Redirecting to dashboard..." : "Redirecting to login...");
        navigate(session ? "/dashboard" : "/auth");
      } catch (err: any) {
        setStatus(`Error: ${err.message}`);
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
      <p>{status}</p>
    </div>
  );
};

export default Index;
