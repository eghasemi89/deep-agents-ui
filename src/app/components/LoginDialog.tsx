"use client";

import { useState } from "react";
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

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (token: string) => void;
}

export function LoginDialog({
  open,
  onOpenChange,
  onLogin,
}: LoginDialogProps) {
  const [token, setToken] = useState("");

  const handleLogin = () => {
    if (!token.trim()) {
      alert("Please enter an authentication token");
      return;
    }

    onLogin(token.trim());
    setToken("");
    onOpenChange(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Authentication Required</DialogTitle>
          <DialogDescription>
            Please enter your authentication token to access the agent. Valid
            tokens include: user1-token, user2-token
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="authToken">Authentication Token</Label>
            <Input
              id="authToken"
              type="password"
              placeholder="Enter your token (e.g., user1-token)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleLogin}>Login</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

