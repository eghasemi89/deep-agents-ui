"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getConfig, saveConfig, StandaloneConfig } from "@/lib/config";
import { ConfigDialog } from "@/app/components/ConfigDialog";
import { Loader2 } from "lucide-react";
import { Chrome } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<StandaloneConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  // Load config on mount
  useEffect(() => {
    const savedConfig = getConfig();
    if (!savedConfig) {
      // No config, show config dialog
      setConfigDialogOpen(true);
      return;
    }

    // Check for environment variables as fallback
    const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let envSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    // Safety check: Never use service key in frontend
    // Service keys typically start with "sb_secret_" or contain "service_role"
    if (envSupabaseAnonKey && (
      envSupabaseAnonKey.includes("service_role") || 
      envSupabaseAnonKey.startsWith("sb_secret_")
    )) {
      console.error("ERROR: Service role key detected in frontend! This is a security risk.");
      envSupabaseAnonKey = undefined; // Don't use it
    }

    // Merge env vars into config if they exist and aren't already set
    const mergedConfig: StandaloneConfig = {
      ...savedConfig,
      supabaseUrl: savedConfig.supabaseUrl || envSupabaseUrl || undefined,
      supabaseAnonKey: savedConfig.supabaseAnonKey || envSupabaseAnonKey || undefined,
    };
    
    // Validate the anon key in merged config too
    if (mergedConfig.supabaseAnonKey && (
      mergedConfig.supabaseAnonKey.includes("service_role") || 
      mergedConfig.supabaseAnonKey.startsWith("sb_secret_")
    )) {
      console.error("ERROR: Service role key found in config! This is a security risk.");
      // Clear the bad key and show error to user
      mergedConfig.supabaseAnonKey = undefined;
      // Save the corrected config
      saveConfig(mergedConfig);
      setError("Service role key detected in config! Please use the ANON key (public key) instead. Click 'Configure Supabase' below to fix this.");
    }

    // Save merged config if env vars were used
    if ((envSupabaseUrl || envSupabaseAnonKey) && 
        (!savedConfig.supabaseUrl || !savedConfig.supabaseAnonKey)) {
      saveConfig(mergedConfig);
    }

    setConfig(mergedConfig);

    // Check if Supabase is configured
    const hasSupabase = !!(mergedConfig.supabaseUrl && mergedConfig.supabaseAnonKey);
    
    if (!hasSupabase) {
      // Show a message that Supabase needs to be configured
      setError("Supabase is not configured. Please add Supabase URL and Anon Key below.");
    }

    // If already authenticated, redirect to home
    if (mergedConfig.authToken) {
      router.push("/");
    }
  }, [router]);

  const handleSaveConfig = (newConfig: StandaloneConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
    setConfigDialogOpen(false);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!config) {
      setError("Configuration not loaded");
      return;
    }

    // Check if Supabase is configured
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      setError("Supabase is not configured. Please configure it using the button below.");
      setConfigDialogOpen(true);
      return;
    }

    // Safety check: Never use service key
    if (config.supabaseAnonKey.includes("service_role") || 
        config.supabaseAnonKey.startsWith("sb_secret_")) {
      setError("ERROR: Service role key detected! Please use the ANON key (public key), not the service_role key. The anon key is safe for browser use.");
      setConfigDialogOpen(true);
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient(
        config.supabaseUrl,
        config.supabaseAnonKey
      );

      if (isSignUp) {
        // Sign up with redirect URL
        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined;

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          // User is automatically signed in
          const newConfig = { ...config, authToken: data.session.access_token };
          saveConfig(newConfig);
          router.push("/");
        } else {
          // Email confirmation required
          setSuccessMessage(
            "Account created! Please check your email to confirm your account before signing in."
          );
          setIsSignUp(false); // Switch to sign in mode
          setEmail(""); // Clear email so user can enter it again
        }
      } else {
        // Sign in
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });

        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          const newConfig = { ...config, authToken: data.session.access_token };
          saveConfig(newConfig);
          router.push("/");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!config) {
      setError("Configuration not loaded");
      return;
    }

    // Check if Supabase is configured
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      setError("Supabase is not configured. Please configure it using the button below.");
      setConfigDialogOpen(true);
      return;
    }

    // Safety check: Never use service key
    if (config.supabaseAnonKey.includes("service_role") || 
        config.supabaseAnonKey.startsWith("sb_secret_")) {
      setError("ERROR: Service role key detected! Please use the ANON key (public key), not the service_role key.");
      setConfigDialogOpen(true);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient(
        config.supabaseUrl,
        config.supabaseAnonKey
      );

      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
        return;
      }

      // OAuth redirect will happen automatically
      // The callback page will handle the token
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleSubmit();
    }
  };

  if (!config) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  const hasSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg border bg-card p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {hasSupabase 
              ? (isSignUp ? "Create Account" : "Sign In")
              : "Authentication Required"
            }
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasSupabase
              ? (isSignUp
                  ? "Create a new account to access the Deep Agents"
                  : "Sign in to access the Deep Agents")
              : "Please configure Supabase in Settings to enable authentication"
            }
          </p>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-600 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {!hasSupabase && (
            <div className="rounded-md bg-yellow-500/15 p-4 text-sm text-yellow-600 dark:text-yellow-400">
              <p className="font-semibold mb-2">Supabase Not Configured</p>
              <p className="mb-3">
                To use email/password authentication, you need to configure Supabase.
                Click the button below to add your Supabase URL and Anon Key.
              </p>
              <Button
                variant="outline"
                onClick={() => setConfigDialogOpen(true)}
                className="mt-2 w-full"
              >
                Configure Supabase
              </Button>
            </div>
          )}

          {hasSupabase && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  autoFocus
                  disabled={loading}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                  className="h-11"
                />
                {isSignUp && (
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 6 characters
                  </p>
                )}
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-11"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isSignUp ? "Creating Account..." : "Signing In..."}
                  </>
                ) : isSignUp ? (
                  "Sign Up"
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                onClick={handleGoogleSignIn}
                disabled={loading}
                variant="outline"
                className="w-full h-11"
                size="lg"
              >
                <Chrome className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                variant="ghost"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setSuccessMessage(null);
                }}
                disabled={loading}
                className="w-full"
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Don't have an account? Sign up"}
              </Button>
            </>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          <p>
            By {isSignUp ? "signing up" : "signing in"}, you agree to our terms
            of service and privacy policy.
          </p>
        </div>
      </div>

      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveConfig}
        initialConfig={config || undefined}
      />
    </div>
  );
}

