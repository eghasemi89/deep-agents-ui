"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { getConfig, saveConfig, StandaloneConfig } from "@/lib/config";
import { ConfigDialog } from "@/app/components/ConfigDialog";
import { LoginDialog } from "@/app/components/LoginDialog";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import { Settings, MessagesSquare, SquarePen, LogOut, Sparkles } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ThreadList } from "@/app/components/ThreadList";
import { ChatProvider } from "@/providers/ChatProvider";
import { ChatInterface } from "@/app/components/ChatInterface";

interface HomePageInnerProps {
  config: StandaloneConfig;
  configDialogOpen: boolean;
  setConfigDialogOpen: (open: boolean) => void;
  handleSaveConfig: (config: StandaloneConfig) => void;
}

function HomePageInner({
  config,
  configDialogOpen,
  setConfigDialogOpen,
  handleSaveConfig,
}: HomePageInnerProps) {
  const client = useClient();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [sidebar, setSidebar] = useQueryState("sidebar");

  const [mutateThreads, setMutateThreads] = useState<(() => void) | null>(null);
  const [interruptCount, setInterruptCount] = useState(0);
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    config.assistantId || "research"
  );

  const fetchAssistant = useCallback(async (assistantId?: string) => {
    const targetId = assistantId || selectedAgentId || config.assistantId;
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetId
      );

    if (isUUID) {
      // We should try to fetch the assistant directly with this UUID
      try {
        const data = await client.assistants.get(targetId);
        setAssistant(data);
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
        setAssistant({
          assistant_id: targetId,
          graph_id: targetId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          config: {},
          metadata: {},
          version: 1,
          name: "Assistant",
          context: {},
        });
      }
    } else {
      try {
        // We should try to list out the assistants for this graph, and then use the default one.
        // TODO: Paginate this search, but 100 should be enough for graph name
        const assistants = await client.assistants.search({
          graphId: targetId,
          limit: 100,
        });
        const defaultAssistant = assistants.find(
          (assistant) => assistant.metadata?.["created_by"] === "system"
        );
        if (defaultAssistant === undefined) {
          throw new Error("No default assistant found");
        }
        setAssistant(defaultAssistant);
      } catch (error: any) {
        // Check if it's a 404 error (graph not found)
        if (error?.status === 404 || error?.response?.status === 404) {
          console.warn(
            `Graph '${targetId}' not found on the backend. Make sure your langgraph.json includes this graph and the server has been restarted.`
          );
          // Fall back to a placeholder assistant
          setAssistant({
            assistant_id: targetId,
            graph_id: targetId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            config: {},
            metadata: {},
            version: 1,
            name: targetId,
            context: {},
          });
        } else {
          console.error(
            "Failed to find default assistant from graph_id:",
            error
          );
          setAssistant({
            assistant_id: targetId,
            graph_id: targetId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            config: {},
            metadata: {},
            version: 1,
            name: targetId,
            context: {},
          });
        }
      }
    }
  }, [client, config.assistantId, selectedAgentId]);

  useEffect(() => {
    fetchAssistant();
  }, [fetchAssistant]);

  // When a thread is loaded, fetch the thread to get its assistant and update selectedAgentId
  // This is a fallback in case the assistantId wasn't available from the thread list
  useEffect(() => {
    if (!threadId || !client) return;

    const loadThreadAssistant = async () => {
      try {
        const thread = await client.threads.get(threadId);
        // Get assistant_id from thread metadata or use the assistant_id directly
        const threadAssistantId = thread.metadata?.assistant_id || thread.assistant_id;
        
        if (threadAssistantId) {
          // Check if it's a graph name (research or chat) or a UUID
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadAssistantId);
          
          if (!isUUID) {
            // It's a graph name, use it directly
            if (threadAssistantId === "research" || threadAssistantId === "chat") {
              // Only update if not already set (to avoid overriding immediate update from thread selection)
              setSelectedAgentId((current) => {
                if (current !== threadAssistantId) {
                  fetchAssistant(threadAssistantId);
                  return threadAssistantId;
                }
                return current;
              });
            }
          } else {
            // It's a UUID, fetch the assistant to get its graph_id
            try {
              const threadAssistant = await client.assistants.get(threadAssistantId);
              if (threadAssistant.graph_id === "research" || threadAssistant.graph_id === "chat") {
                setSelectedAgentId((current) => {
                  if (current !== threadAssistant.graph_id) {
                    setAssistant(threadAssistant);
                    return threadAssistant.graph_id;
                  }
                  return current;
                });
              }
            } catch (error) {
              console.error("Failed to fetch thread assistant:", error);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load thread:", error);
      }
    };

    loadThreadAssistant();
  }, [threadId, client, fetchAssistant]);

  const handleAssistantChange = useCallback(
    async (newAssistantId: string) => {
      // Update immediately for instant UI feedback
      setSelectedAgentId(newAssistantId);
      // Clear thread when switching assistants (async but don't wait)
      setThreadId(null);
      // Fetch the new assistant in the background
      fetchAssistant(newAssistantId);
    },
    [fetchAssistant, setThreadId]
  );

  // Get the current agent name based on selectedAgentId
  const availableAgents = [
    { id: "research", name: "Research" },
    { id: "chat", name: "Chat" },
  ];
  const currentAgentName = useMemo(() => {
    const currentAgentId = selectedAgentId || assistant?.graph_id || assistant?.assistant_id || config.assistantId || "research";
    const agent = availableAgents.find((a) => a.id === currentAgentId);
    return agent?.name || currentAgentId;
  }, [selectedAgentId, assistant?.graph_id, assistant?.assistant_id, config.assistantId]);

  return (
    <>
      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveConfig}
        initialConfig={config}
      />
      <div className="flex h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Deep Agent UI</h1>
            {!sidebar && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebar("1")}
                className="rounded-md border border-border bg-card p-3 text-foreground hover:bg-accent"
              >
                <MessagesSquare className="mr-2 h-4 w-4" />
                Threads
                {interruptCount > 0 && (
                  <span className="ml-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                    {interruptCount}
                  </span>
                )}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Assistant:</span>{" "}
              {currentAgentName}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigDialogOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newConfig = { ...config, authToken: undefined };
                handleSaveConfig(newConfig);
                // Reload to show login dialog
                window.location.reload();
              }}
              title="Logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThreadId(null)}
              disabled={!threadId}
              className="border-[#2F6868] bg-[#2F6868] text-white hover:bg-[#2F6868]/80"
            >
              <SquarePen className="mr-2 h-4 w-4" />
              New Thread
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="standalone-chat"
          >
            {sidebar && (
              <>
                <ResizablePanel
                  id="thread-history"
                  order={1}
                  defaultSize={25}
                  minSize={20}
                  className="relative min-w-[380px]"
                >
                  <ThreadList
                    onThreadSelect={async (id, assistantId) => {
                      // Immediately update selectedAgentId if we have assistant info
                      if (assistantId) {
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assistantId);
                        if (!isUUID && (assistantId === "research" || assistantId === "chat")) {
                          // It's a graph name, update immediately
                          setSelectedAgentId(assistantId);
                          fetchAssistant(assistantId);
                        } else if (isUUID && client) {
                          // It's a UUID, fetch the assistant to get graph_id
                          try {
                            const threadAssistant = await client.assistants.get(assistantId);
                            if (threadAssistant.graph_id === "research" || threadAssistant.graph_id === "chat") {
                              setSelectedAgentId(threadAssistant.graph_id);
                              setAssistant(threadAssistant);
                            }
                          } catch (error) {
                            console.error("Failed to fetch assistant for thread:", error);
                          }
                        }
                      }
                      await setThreadId(id);
                    }}
                    onMutateReady={(fn) => setMutateThreads(() => fn)}
                    onClose={() => setSidebar(null)}
                    onInterruptCountChange={setInterruptCount}
                  />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            <ResizablePanel
              id="chat"
              className="relative flex flex-col"
              order={2}
            >
              <ChatProvider
                activeAssistant={assistant}
                onHistoryRevalidate={() => mutateThreads?.()}
              >
                <ChatInterface 
                  assistant={assistant}
                  selectedAgentId={selectedAgentId}
                  onAssistantChange={handleAssistantChange}
                  availableAgents={[
                    { id: "research", name: "Research", icon: <Sparkles size={14} /> },
                    { id: "chat", name: "Chat", icon: <MessagesSquare size={14} /> },
                  ]}
                />
              </ChatProvider>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  );
}

function HomePageContent() {
  const router = useRouter();
  const [config, setConfig] = useState<StandaloneConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [assistantId, setAssistantId] = useQueryState("assistantId");

  // On mount, check for saved config, otherwise show config dialog
  useEffect(() => {
    const savedConfig = getConfig();
    if (savedConfig) {
      setConfig(savedConfig);
      if (!assistantId) {
        setAssistantId(savedConfig.assistantId);
      }
      // Check if auth token is missing (or if using Supabase, check if token is missing)
      const needsAuth = savedConfig.supabaseUrl && savedConfig.supabaseAnonKey
        ? !savedConfig.authToken // Using Supabase, need token
        : !savedConfig.authToken; // Using legacy auth, need token
      if (needsAuth && savedConfig.supabaseUrl && savedConfig.supabaseAnonKey) {
        // Redirect to auth page if using Supabase
        router.push("/auth");
        return;
      }
    } else {
      setConfigDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If config changes, update the assistantId
  useEffect(() => {
    if (config && !assistantId) {
      setAssistantId(config.assistantId);
    }
    // Check if auth token is missing after config is loaded
    const needsAuth = config?.supabaseUrl && config?.supabaseAnonKey
      ? !config.authToken // Using Supabase, need token
      : !config?.authToken; // Using legacy auth, need token
    if (config && needsAuth && config.supabaseUrl && config.supabaseAnonKey) {
      // Redirect to auth page if using Supabase
      router.push("/auth");
    }
  }, [config, assistantId, setAssistantId]);

  const handleSaveConfig = useCallback((newConfig: StandaloneConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
  }, []);


  const langsmithApiKey =
    config?.langsmithApiKey || process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";

  if (!config) {
    return (
      <>
        <ConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleSaveConfig}
        />
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome to Standalone Chat</h1>
            <p className="mt-2 text-muted-foreground">
              Configure your deployment to get started
            </p>
            <Button
              onClick={() => setConfigDialogOpen(true)}
              className="mt-4"
            >
              Open Configuration
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Always redirect to /auth if no token (let auth page handle Supabase vs legacy)
  if (!config.authToken) {
    router.push("/auth");
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Redirecting to authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <ClientProvider
      deploymentUrl={config.deploymentUrl}
      apiKey={langsmithApiKey}
      authToken={config.authToken}
    >
      <HomePageInner
        config={config}
        configDialogOpen={configDialogOpen}
        setConfigDialogOpen={setConfigDialogOpen}
        handleSaveConfig={handleSaveConfig}
      />
    </ClientProvider>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
