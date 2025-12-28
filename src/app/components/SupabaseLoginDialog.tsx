"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface SupabaseLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (token: string) => void;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function SupabaseLoginDialog({
  open,
  onOpenChange,
  onLogin,
  supabaseUrl,
  supabaseAnonKey,
}: SupabaseLoginDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // Sign up with redirect URL
        // Use the current origin for the redirect URL
        const redirectUrl = typeof window !== "undefined" 
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
          onLogin(data.session.access_token);
          setEmail("");
          setPassword("");
          onOpenChange(false);
        } else {
          // Email confirmation required
          setError(
            "Please check your email to confirm your account before signing in."
          );
        }
      } else {
        // Sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          onLogin(data.session.access_token);
          setEmail("");
          setPassword("");
          onOpenChange(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isSignUp ? "Create Account" : "Sign In"}
          </DialogTitle>
          <DialogDescription>
            {isSignUp
              ? "Create a new account to access the agent"
              : "Sign in with your email and password to access the agent"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-2">
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
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            disabled={loading}
            className="sm:mr-auto"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

