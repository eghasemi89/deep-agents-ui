"use client";

import { ReactNode, createContext, useContext, useState, useCallback } from "react";
import { Assistant } from "@langchain/langgraph-sdk";
import { type StateType, useChat } from "@/app/hooks/useChat";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";

export interface RuntimeConfig {
  model_name?: string;
  selected_tools?: string[];
  // Subagent configuration
  selected_subagents?: string[];  // List of subagent names to include
  subagent_model_name?: string;  // Optional: if not set, uses main agent model
  subagent_selected_tools?: string[];  // Optional: if not set, uses main agent tools
}

interface ChatProviderProps {
  children: ReactNode;
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
  initialRuntimeConfig?: RuntimeConfig;
}

export function ChatProvider({
  children,
  activeAssistant,
  onHistoryRevalidate,
  thread,
  initialRuntimeConfig,
}: ChatProviderProps) {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(
    initialRuntimeConfig || {
      model_name: "openai:gpt-4o",
      selected_tools: ["tavily_search", "think_tool"],
      selected_subagents: ["research-agent"],  // Default: include research-agent (empty array = no subagents)
    }
  );

  const updateRuntimeConfig = useCallback((config: RuntimeConfig | ((prev: RuntimeConfig) => RuntimeConfig)) => {
    setRuntimeConfig((prev) => (typeof config === "function" ? config(prev) : config));
  }, []);

  const chat = useChat({ activeAssistant, onHistoryRevalidate, thread, runtimeConfig });
  
  // Add runtimeConfig and updateRuntimeConfig to the context value
  const contextValue = {
    ...chat,
    runtimeConfig,
    updateRuntimeConfig,
  };

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

export type ChatContextType = ReturnType<typeof useChat> & {
  runtimeConfig: RuntimeConfig;
  updateRuntimeConfig: (config: RuntimeConfig | ((prev: RuntimeConfig) => RuntimeConfig)) => void;
};

export const ChatContext = createContext<ChatContextType | undefined>(
  undefined
);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}
