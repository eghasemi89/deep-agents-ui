"use client";

import { useState, useEffect } from "react";
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
import { StandaloneConfig } from "@/lib/config";

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: StandaloneConfig) => void;
  initialConfig?: StandaloneConfig;
}

export function ConfigDialog({
  open,
  onOpenChange,
  onSave,
  initialConfig,
}: ConfigDialogProps) {
  const [deploymentUrl, setDeploymentUrl] = useState(
    initialConfig?.deploymentUrl || ""
  );
  const [assistantId, setAssistantId] = useState(
    initialConfig?.assistantId || ""
  );
  const [langsmithApiKey, setLangsmithApiKey] = useState(
    initialConfig?.langsmithApiKey || ""
  );
  const [authToken, setAuthToken] = useState(
    initialConfig?.authToken || ""
  );
  const [supabaseUrl, setSupabaseUrl] = useState(
    initialConfig?.supabaseUrl || ""
  );
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(
    initialConfig?.supabaseAnonKey || ""
  );

  useEffect(() => {
    if (open && initialConfig) {
      setDeploymentUrl(initialConfig.deploymentUrl);
      setAssistantId(initialConfig.assistantId);
      setLangsmithApiKey(initialConfig.langsmithApiKey || "");
      setAuthToken(initialConfig.authToken || "");
      setSupabaseUrl(initialConfig.supabaseUrl || "");
      setSupabaseAnonKey(initialConfig.supabaseAnonKey || "");
    }
  }, [open, initialConfig]);

  const handleSave = () => {
    if (!deploymentUrl || !assistantId) {
      alert("Please fill in all required fields");
      return;
    }

    onSave({
      deploymentUrl,
      assistantId,
      langsmithApiKey: langsmithApiKey || undefined,
      authToken: authToken || undefined,
      supabaseUrl: supabaseUrl || undefined,
      supabaseAnonKey: supabaseAnonKey || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
          <DialogDescription>
            Configure your LangGraph deployment settings. These settings are
            saved in your browser&apos;s local storage.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="deploymentUrl">Deployment URL</Label>
            <Input
              id="deploymentUrl"
              placeholder="https://<deployment-url>"
              value={deploymentUrl}
              onChange={(e) => setDeploymentUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assistantId">Assistant ID</Label>
            <Input
              id="assistantId"
              placeholder="<assistant-id>"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="langsmithApiKey">
              LangSmith API Key{" "}
              <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Input
              id="langsmithApiKey"
              type="password"
              placeholder="lsv2_pt_..."
              value={langsmithApiKey}
              onChange={(e) => setLangsmithApiKey(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supabaseUrl">
              Supabase URL{" "}
              <span className="text-muted-foreground">(Optional - for OAuth)</span>
            </Label>
            <Input
              id="supabaseUrl"
              type="url"
              placeholder="https://xxxxx.supabase.co"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your Supabase project URL
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supabaseAnonKey">
              Supabase Anon Key{" "}
              <span className="text-muted-foreground">(Optional - for OAuth)</span>
            </Label>
            <Input
              id="supabaseAnonKey"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={supabaseAnonKey}
              onChange={(e) => setSupabaseAnonKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your Supabase anon/public key (safe for client-side use)
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="authToken">
              Authentication Token{" "}
              <span className="text-muted-foreground">(Legacy - use Supabase OAuth instead)</span>
            </Label>
            <Input
              id="authToken"
              type="password"
              placeholder="user1-token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Legacy bearer token (only used if Supabase is not configured)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
