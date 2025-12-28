"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getConfig, saveConfig } from "@/lib/config";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const config = getConfig();
        if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
          setStatus("error");
          setMessage("Supabase is not configured");
          return;
        }

        const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

        // Handle OAuth callback - Supabase puts tokens in the hash for OAuth
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const accessToken = hashParams.get("access_token");
        const error = hashParams.get("error");
        const errorDescription = hashParams.get("error_description");

        if (error) {
          setStatus("error");
          setMessage(errorDescription || error || "Authentication failed");
          return;
        }

        // For OAuth flows, the access token comes in the hash
        if (accessToken) {
          // Save the token and redirect
          const newConfig = { ...config, authToken: accessToken };
          saveConfig(newConfig);
          setStatus("success");
          setMessage("Successfully authenticated! Redirecting...");
          
          // Redirect to home after a short delay
          setTimeout(() => {
            router.push("/");
          }, 1500);
          return;
        }

        // For email confirmation or if no hash params, try to get session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          setStatus("error");
          setMessage(sessionError.message || "Failed to get session");
          return;
        }

        if (session) {
          // Save the token and redirect
          const newConfig = { ...config, authToken: session.access_token };
          saveConfig(newConfig);
          setStatus("success");
          setMessage("Successfully authenticated! Redirecting...");
          
          setTimeout(() => {
            router.push("/");
          }, 1500);
        } else {
          // No session found - might be email confirmation that needs user action
          setStatus("error");
          setMessage("No session found. Please try signing in again.");
        }
      } catch (err) {
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-lg text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="text-2xl font-bold">Confirming your email...</h1>
            <p className="text-muted-foreground">
              Please wait while we verify your email confirmation.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="text-2xl font-bold">Email Confirmed!</h1>
            <p className="text-muted-foreground">{message}</p>
            <Button onClick={() => router.push("/")} className="mt-4">
              Go to App
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="text-2xl font-bold">Confirmation Failed</h1>
            <p className="text-muted-foreground">{message}</p>
            <div className="flex gap-4 justify-center mt-6">
              <Button variant="outline" onClick={() => router.push("/auth")}>
                Go to Sign In
              </Button>
              <Button onClick={() => router.push("/")}>
                Go to Home
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

