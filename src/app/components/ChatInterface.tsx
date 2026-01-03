"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  FormEvent,
  Fragment,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  CheckCircle,
  Clock,
  Circle,
  FileIcon,
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  X,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ChatMessage } from "@/app/components/ChatMessage";
import type {
  TodoItem,
  ToolCall,
  ActionRequest,
  ReviewConfig,
} from "@/app/types/types";
import { Assistant, Message } from "@langchain/langgraph-sdk";
import { extractStringFromMessageContent } from "@/app/utils/utils";
import { useChatContext } from "@/providers/ChatProvider";
import { cn } from "@/lib/utils";
import { useStickToBottom } from "use-stick-to-bottom";
import { FilesPopover } from "@/app/components/TasksFilesSidebar";
import { getConfig } from "@/lib/config";
import type { RuntimeConfig } from "@/providers/ChatProvider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

// Type for uploaded image data
interface UploadedImage {
  doc_id: string;
  storage_url: string;
  storage_path: string;
}

// Upload images to backend
async function uploadImages(files: File[]): Promise<UploadedImage[]> {
  const config = getConfig();
  if (!config?.deploymentUrl || !config?.authToken) {
    throw new Error("Configuration missing: deploymentUrl or authToken not found");
  }

  const baseUrl = config.deploymentUrl.replace(/\/+$/, "");
  const uploadUrl = `${baseUrl}/api/v1/upload-image`;

  const uploadPromises = files.map(async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.authToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload image: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      doc_id: data.doc_id,
      storage_url: data.storage_url,
      storage_path: data.storage_path,
    };
  });

  return Promise.all(uploadPromises);
}

interface ChatInterfaceProps {
  assistant: Assistant | null;
  selectedAgentId?: string;
  onAssistantChange?: (assistantId: string) => void;
  availableAgents?: Array<{ id: string; name: string; icon?: React.ReactNode }>;
}

const getStatusIcon = (status: TodoItem["status"], className?: string) => {
  switch (status) {
    case "completed":
      return (
        <CheckCircle
          size={16}
          className={cn("text-success/80", className)}
        />
      );
    case "in_progress":
      return (
        <Clock
          size={16}
          className={cn("text-warning/80", className)}
        />
      );
    default:
      return (
        <Circle
          size={16}
          className={cn("text-tertiary/70", className)}
        />
      );
  }
};

export const ChatInterface = React.memo<ChatInterfaceProps>(({ 
  assistant,
  selectedAgentId,
  onAssistantChange,
  availableAgents = [
    { id: "research", name: "Research", icon: <Sparkles size={14} /> },
    { id: "chat", name: "Chat", icon: <MessageSquare size={14} /> },
  ],
}) => {
  const [metaOpen, setMetaOpen] = useState<"tasks" | "files" | null>(null);
  const tasksContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const { scrollRef, contentRef } = useStickToBottom();

  // Available models
  const availableModels = [
    { value: "openai:gpt-4o", label: "GPT-4o (OpenAI)" },
    { value: "openai:gpt-4-turbo", label: "GPT-4 Turbo (OpenAI)" },
    { value: "anthropic:claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5 (Anthropic)" },
    { value: "anthropic:claude-opus-4-20250514", label: "Claude Opus 4 (Anthropic)" },
    { value: "google:gemini-3-pro-preview", label: "Gemini 3 Pro (Google)" },
  ];

  // Available tools
  const availableTools = [
    { value: "tavily_search", label: "Tavily Search" },
    { value: "think_tool", label: "Think Tool" },
  ];

  // Available subagents
  const availableSubagents = [
    { value: "research-agent", label: "Research Agent", description: "Specialized agent for conducting research tasks" },
    // Add more subagents here as they become available
  ];

  const {
    stream,
    messages,
    todos,
    files,
    ui,
    setFiles,
    isLoading,
    isThreadLoading,
    interrupt,
    sendMessage,
    resumeInterrupt,
    threadId,
    setThreadId,
    runtimeConfig: contextRuntimeConfig,
    updateRuntimeConfig,
  } = useChatContext();

  // Use context runtimeConfig with defaults
  // Default: all subagents selected (user can deselect)
  const defaultSubagents = availableSubagents.map(s => s.value);
  const effectiveRuntimeConfig = contextRuntimeConfig || {
    model_name: "openai:gpt-4o",
    selected_tools: ["tavily_search", "think_tool"],
    selected_subagents: defaultSubagents,
  };
  
  // Ensure selected_subagents defaults to all if not set
  if (!effectiveRuntimeConfig.selected_subagents || effectiveRuntimeConfig.selected_subagents.length === 0) {
    effectiveRuntimeConfig.selected_subagents = defaultSubagents;
  }
  
  const setEffectiveRuntimeConfig = useCallback((updater: RuntimeConfig | ((prev: RuntimeConfig) => RuntimeConfig)) => {
    if (updateRuntimeConfig) {
      updateRuntimeConfig(updater);
    }
  }, [updateRuntimeConfig]);

  const submitDisabled = isLoading || !assistant;

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((file) => 
      file.type.startsWith("image/")
    );

    const newImages = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setSelectedImages((prev) => [...prev, ...newImages]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const newImages = [...prev];
      const removed = newImages.splice(index, 1)[0];
      if (removed.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return newImages;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      if (e) {
        e.preventDefault();
      }
      const messageText = input.trim();
      if ((!messageText && selectedImages.length === 0) || isLoading || submitDisabled) return;
      
      const imagesToUpload = selectedImages.map(img => img.file);
      
      // Clean up preview URLs
      selectedImages.forEach(img => {
        if (img.preview) {
          URL.revokeObjectURL(img.preview);
        }
      });
      setSelectedImages([]);
      
      // Path A & B: If we have images, upload them first, then send multimodal message
      // Path C: If no images, just send text message
      if (imagesToUpload.length > 0) {
        setIsUploading(true);
        try {
          // Upload images first
          const uploadedImages = await uploadImages(imagesToUpload);
          
          // Send multimodal message (text + image URLs)
          // If threadId is null, stream.submit() will automatically create a new thread
          sendMessage(messageText, uploadedImages);
        } catch (error) {
          console.error("Failed to upload images:", error);
          alert(`Failed to upload images: ${error instanceof Error ? error.message : "Unknown error"}`);
          // Still send text message even if image upload fails
          if (messageText) {
            sendMessage(messageText);
          }
        } finally {
          setIsUploading(false);
        }
      } else {
        // Path C: No images, just send text message
        // If threadId is null, stream.submit() will automatically create a new thread
        sendMessage(messageText);
      }
      
      setInput("");
    },
    [input, isLoading, sendMessage, submitDisabled, selectedImages]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (submitDisabled) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, submitDisabled]
  );

  // Auto-expand textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";
      // Set height to scrollHeight, but cap at max 200px (about 8-9 lines)
      const maxHeight = 200;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Initialize textarea height on mount
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "44px"; // Initial min height
    }
  }, []);

  // TODO: can we make this part of the hook?
  const processedMessages = useMemo(() => {
    /*
     1. Loop through all messages
     2. For each AI message, add the AI message, and any tool calls to the messageMap
     3. For each tool message, find the corresponding tool call in the messageMap and update the status and output
    */
    const messageMap = new Map<
      string,
      { message: Message; toolCalls: ToolCall[] }
    >();
    messages.forEach((message: Message) => {
      if (message.type === "ai") {
        const toolCallsInMessage: Array<{
          id?: string;
          function?: { name?: string; arguments?: unknown };
          name?: string;
          type?: string;
          args?: unknown;
          input?: unknown;
        }> = [];
        if (
          message.additional_kwargs?.tool_calls &&
          Array.isArray(message.additional_kwargs.tool_calls)
        ) {
          toolCallsInMessage.push(...message.additional_kwargs.tool_calls);
        } else if (message.tool_calls && Array.isArray(message.tool_calls)) {
          toolCallsInMessage.push(
            ...message.tool_calls.filter(
              (toolCall: { name?: string }) => toolCall.name !== ""
            )
          );
        } else if (Array.isArray(message.content)) {
          const toolUseBlocks = message.content.filter(
            (block: { type?: string }) => block.type === "tool_use"
          );
          toolCallsInMessage.push(...toolUseBlocks);
        }
        const toolCallsWithStatus = toolCallsInMessage.map(
          (toolCall: {
            id?: string;
            function?: { name?: string; arguments?: unknown };
            name?: string;
            type?: string;
            args?: unknown;
            input?: unknown;
          }) => {
            const name =
              toolCall.function?.name ||
              toolCall.name ||
              toolCall.type ||
              "unknown";
            const args =
              toolCall.function?.arguments ||
              toolCall.args ||
              toolCall.input ||
              {};
            return {
              id: toolCall.id || `tool-${Math.random()}`,
              name,
              args,
              status: interrupt ? "interrupted" : ("pending" as const),
            } as ToolCall;
          }
        );
        messageMap.set(message.id!, {
          message,
          toolCalls: toolCallsWithStatus,
        });
      } else if (message.type === "tool") {
        const toolCallId = message.tool_call_id;
        if (!toolCallId) {
          return;
        }
        for (const [, data] of messageMap.entries()) {
          const toolCallIndex = data.toolCalls.findIndex(
            (tc: ToolCall) => tc.id === toolCallId
          );
          if (toolCallIndex === -1) {
            continue;
          }
          data.toolCalls[toolCallIndex] = {
            ...data.toolCalls[toolCallIndex],
            status: "completed" as const,
            result: extractStringFromMessageContent(message),
          };
          break;
        }
      } else if (message.type === "human") {
        messageMap.set(message.id!, {
          message,
          toolCalls: [],
        });
      }
    });
    const processedArray = Array.from(messageMap.values());
    return processedArray.map((data, index) => {
      const prevMessage = index > 0 ? processedArray[index - 1].message : null;
      return {
        ...data,
        showAvatar: data.message.type !== prevMessage?.type,
      };
    });
  }, [messages, interrupt]);

  const groupedTodos = {
    in_progress: todos.filter((t) => t.status === "in_progress"),
    pending: todos.filter((t) => t.status === "pending"),
    completed: todos.filter((t) => t.status === "completed"),
  };

  const hasTasks = todos.length > 0;
  const hasFiles = Object.keys(files).length > 0;

  // Parse out any action requests or review configs from the interrupt
  const actionRequestsMap: Map<string, ActionRequest> | null = useMemo(() => {
    const actionRequests =
      interrupt?.value && (interrupt.value as any)["action_requests"];
    if (!actionRequests) return new Map<string, ActionRequest>();
    return new Map(actionRequests.map((ar: ActionRequest) => [ar.name, ar]));
  }, [interrupt]);

  const reviewConfigsMap: Map<string, ReviewConfig> | null = useMemo(() => {
    const reviewConfigs =
      interrupt?.value && (interrupt.value as any)["review_configs"];
    if (!reviewConfigs) return new Map<string, ReviewConfig>();
    return new Map(
      reviewConfigs.map((rc: ReviewConfig) => [rc.actionName, rc])
    );
  }, [interrupt]);


  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      selectedImages.forEach((img) => {
        if (img.preview) {
          URL.revokeObjectURL(img.preview);
        }
      });
    };
  }, [selectedImages]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        ref={scrollRef}
      >
        <div
          className="mx-auto w-full max-w-[1024px] px-6 pb-6 pt-4"
          ref={contentRef}
        >
          {isThreadLoading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <>
              {processedMessages.map((data, index) => {
                const messageUi = ui?.filter(
                  (u: any) => u.metadata?.message_id === data.message.id
                );
                const isLastMessage = index === processedMessages.length - 1;
                return (
                  <ChatMessage
                    key={data.message.id}
                    message={data.message}
                    toolCalls={data.toolCalls}
                    isLoading={isLoading}
                    actionRequestsMap={
                      isLastMessage ? actionRequestsMap : undefined
                    }
                    reviewConfigsMap={
                      isLastMessage ? reviewConfigsMap : undefined
                    }
                    ui={messageUi}
                    stream={stream}
                    onResumeInterrupt={resumeInterrupt}
                    graphId={assistant?.graph_id}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 bg-background">
        {/* Configuration Panel */}
        {selectedAgentId === "research" && (
          <div className="mx-4 mb-2">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-sidebar px-4 py-2 text-sm hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <Settings size={14} />
                <span>Agent Configuration</span>
                {effectiveRuntimeConfig.model_name && (
                  <span className="text-xs text-muted-foreground">
                    ({effectiveRuntimeConfig.model_name.split(":")[1] || effectiveRuntimeConfig.model_name})
                  </span>
                )}
              </div>
              {showConfig ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showConfig && (
              <div className="mt-2 rounded-lg border border-border bg-sidebar p-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="model-select" className="text-sm font-medium">
                      Model
                    </Label>
                    <Select
                      value={effectiveRuntimeConfig.model_name || "openai:gpt-4o"}
                      onValueChange={(value) => {
                        setEffectiveRuntimeConfig((prev: RuntimeConfig) => ({
                          ...prev,
                          model_name: value,
                        }));
                      }}
                    >
                      <SelectTrigger id="model-select" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Tools</Label>
                    <div className="space-y-2">
                      {availableTools.map((tool) => {
                        const isChecked = effectiveRuntimeConfig.selected_tools?.includes(tool.value) ?? false;
                        const handleToggle = () => {
                          const newChecked = !isChecked;
                          setEffectiveRuntimeConfig((prev: RuntimeConfig) => {
                            const currentTools = prev?.selected_tools || [];
                            const newTools = newChecked
                              ? (currentTools.includes(tool.value) 
                                  ? currentTools 
                                  : [...currentTools, tool.value])
                              : currentTools.filter((t) => t !== tool.value);
                            
                            return {
                              ...prev,
                              selected_tools: newTools,
                            };
                          });
                        };
                        
                        return (
                          <div 
                            key={tool.value} 
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`tool-${tool.value}`}
                              checked={isChecked}
                              onCheckedChange={handleToggle}
                            />
                            <Label
                              htmlFor={`tool-${tool.value}`}
                              className="text-sm font-normal cursor-pointer select-none"
                              onClick={(e) => {
                                e.preventDefault();
                                handleToggle();
                              }}
                            >
                              {tool.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subagents */}
                  <div className="border-t border-border pt-4 mt-4">
                    <Label className="text-sm font-semibold mb-3 block">Subagents</Label>
                    <div className="space-y-2 pl-2 border-l-2 border-border/50">
                          {availableSubagents.map((subagent) => {
                            // Check if subagent is selected (handle undefined and empty array cases)
                            const selectedSubagents = effectiveRuntimeConfig.selected_subagents || [];
                            const isChecked = Array.isArray(selectedSubagents) && selectedSubagents.includes(subagent.value);
                            const handleToggle = () => {
                              setEffectiveRuntimeConfig((prev: RuntimeConfig) => {
                                const currentSubagents = prev?.selected_subagents || [];
                                const newSubagents = !isChecked
                                  ? (currentSubagents.includes(subagent.value) 
                                      ? currentSubagents 
                                      : [...currentSubagents, subagent.value])
                                  : currentSubagents.filter((s) => s !== subagent.value);
                                
                                return {
                                  ...prev,
                                  // Always send an array (empty array means no subagents)
                                  selected_subagents: newSubagents,
                                };
                              });
                            };
                            
                            return (
                              <div 
                                key={`subagent-${subagent.value}`} 
                                className="flex items-start space-x-2"
                              >
                                <Checkbox
                                  id={`subagent-select-${subagent.value}`}
                                  checked={isChecked}
                                  onCheckedChange={handleToggle}
                                  className="mt-0.5"
                                />
                                <div className="flex-1">
                                  <Label
                                    htmlFor={`subagent-select-${subagent.value}`}
                                    className="text-sm font-normal cursor-pointer select-none"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleToggle();
                                    }}
                                  >
                                    {subagent.label}
                                  </Label>
                                  {subagent.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {subagent.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            "mx-4 mb-6 flex flex-shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background",
            "mx-auto w-[calc(100%-32px)] max-w-[1024px] transition-colors duration-200 ease-in-out"
          )}
        >
          {(hasTasks || hasFiles) && (
            <div className="flex max-h-72 flex-col overflow-y-auto border-b border-border bg-sidebar empty:hidden">
              {!metaOpen && (
                <>
                  {(() => {
                    const activeTask = todos.find(
                      (t) => t.status === "in_progress"
                    );

                    const totalTasks = todos.length;
                    const remainingTasks =
                      totalTasks - groupedTodos.pending.length;
                    const isCompleted = totalTasks === remainingTasks;

                    const tasksTrigger = (() => {
                      if (!hasTasks) return null;
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setMetaOpen((prev) =>
                              prev === "tasks" ? null : "tasks"
                            )
                          }
                          className="grid w-full cursor-pointer grid-cols-[auto_auto_1fr] items-center gap-3 px-[18px] py-3 text-left"
                          aria-expanded={metaOpen === "tasks"}
                        >
                          {(() => {
                            if (isCompleted) {
                              return [
                                <CheckCircle
                                  key="icon"
                                  size={16}
                                  className="text-success/80"
                                />,
                                <span
                                  key="label"
                                  className="ml-[1px] min-w-0 truncate text-sm"
                                >
                                  All tasks completed
                                </span>,
                              ];
                            }

                            if (activeTask != null) {
                              return [
                                <div key="icon">
                                  {getStatusIcon(activeTask.status)}
                                </div>,
                                <span
                                  key="label"
                                  className="ml-[1px] min-w-0 truncate text-sm"
                                >
                                  Task{" "}
                                  {totalTasks - groupedTodos.pending.length} of{" "}
                                  {totalTasks}
                                </span>,
                                <span
                                  key="content"
                                  className="min-w-0 gap-2 truncate text-sm text-muted-foreground"
                                >
                                  {activeTask.content}
                                </span>,
                              ];
                            }

                            return [
                              <Circle
                                key="icon"
                                size={16}
                                className="text-tertiary/70"
                              />,
                              <span
                                key="label"
                                className="ml-[1px] min-w-0 truncate text-sm"
                              >
                                Task {totalTasks - groupedTodos.pending.length}{" "}
                                of {totalTasks}
                              </span>,
                            ];
                          })()}
                        </button>
                      );
                    })();

                    const filesTrigger = (() => {
                      if (!hasFiles) return null;
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setMetaOpen((prev) =>
                              prev === "files" ? null : "files"
                            )
                          }
                          className="flex flex-shrink-0 cursor-pointer items-center gap-2 px-[18px] py-3 text-left text-sm"
                          aria-expanded={metaOpen === "files"}
                        >
                          <FileIcon size={16} />
                          Files (State)
                          <span className="h-4 min-w-4 rounded-full bg-[#2F6868] px-0.5 text-center text-[10px] leading-[16px] text-white">
                            {Object.keys(files).length}
                          </span>
                        </button>
                      );
                    })();

                    return (
                      <div className="grid grid-cols-[1fr_auto_auto] items-center">
                        {tasksTrigger}
                        {filesTrigger}
                      </div>
                    );
                  })()}
                </>
              )}

              {metaOpen && (
                <>
                  <div className="sticky top-0 flex items-stretch bg-sidebar text-sm">
                    {hasTasks && (
                      <button
                        type="button"
                        className="py-3 pr-4 first:pl-[18px] aria-expanded:font-semibold"
                        onClick={() =>
                          setMetaOpen((prev) =>
                            prev === "tasks" ? null : "tasks"
                          )
                        }
                        aria-expanded={metaOpen === "tasks"}
                      >
                        Tasks
                      </button>
                    )}
                    {hasFiles && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 py-3 pr-4 first:pl-[18px] aria-expanded:font-semibold"
                        onClick={() =>
                          setMetaOpen((prev) =>
                            prev === "files" ? null : "files"
                          )
                        }
                        aria-expanded={metaOpen === "files"}
                      >
                        Files (State)
                        <span className="h-4 min-w-4 rounded-full bg-[#2F6868] px-0.5 text-center text-[10px] leading-[16px] text-white">
                          {Object.keys(files).length}
                        </span>
                      </button>
                    )}
                    <button
                      aria-label="Close"
                      className="flex-1"
                      onClick={() => setMetaOpen(null)}
                    />
                  </div>
                  <div
                    ref={tasksContainerRef}
                    className="px-[18px]"
                  >
                    {metaOpen === "tasks" &&
                      Object.entries(groupedTodos)
                        .filter(([_, todos]) => todos.length > 0)
                        .map(([status, todos]) => (
                          <div
                            key={status}
                            className="mb-4"
                          >
                            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                              {
                                {
                                  pending: "Pending",
                                  in_progress: "In Progress",
                                  completed: "Completed",
                                }[status]
                              }
                            </h3>
                            <div className="grid grid-cols-[auto_1fr] gap-3 rounded-sm p-1 pl-0 text-sm">
                              {todos.map((todo, index) => (
                                <Fragment key={`${status}_${todo.id}_${index}`}>
                                  {getStatusIcon(todo.status, "mt-0.5")}
                                  <span className="break-words text-inherit">
                                    {todo.content}
                                  </span>
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        ))}

                    {metaOpen === "files" && (
                      <div className="mb-6">
                        <FilesPopover
                          files={files}
                          setFiles={setFiles}
                          editDisabled={
                            isLoading === true || interrupt !== undefined
                          }
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col"
          >
            {selectedImages.length > 0 && (
              <div className="flex gap-2 px-[18px] py-2 overflow-x-auto">
                {selectedImages.map((img, index) => (
                  <div key={index} className="relative flex-shrink-0">
                    <img
                      src={img.preview}
                      alt={`Preview ${index + 1}`}
                      className="h-10 w-10 object-cover rounded border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Running..." : "Write your message..."}
              className="font-inherit resize-none border-0 bg-transparent px-[18px] py-2 text-sm leading-7 text-primary outline-none placeholder:text-tertiary overflow-y-auto"
              rows={1}
              style={{ minHeight: "44px", maxHeight: "200px" }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-border py-1.5 px-3">
              <div className="flex items-center gap-2">
                {onAssistantChange && availableAgents.length > 1 && (
                  <Select
                    value={selectedAgentId || assistant?.graph_id || assistant?.assistant_id || availableAgents[0]?.id || ""}
                    onValueChange={(value) => {
                      onAssistantChange?.(value);
                    }}
                    disabled={messages.length > 0}
                  >
                    <SelectTrigger 
                      className={cn(
                        "h-7 w-[130px] border-border bg-background text-xs",
                        messages.length > 0 && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const currentAgentId = selectedAgentId || assistant?.graph_id || assistant?.assistant_id;
                          const currentAgent = availableAgents.find(
                            (a) => a.id === currentAgentId
                          ) || availableAgents[0];
                          return currentAgent.icon;
                        })()}
                        <SelectValue>
                          {(() => {
                            const currentAgentId = selectedAgentId || assistant?.graph_id || assistant?.assistant_id;
                            const currentAgent = availableAgents.find(
                              (a) => a.id === currentAgentId
                            ) || availableAgents[0];
                            return currentAgent.name;
                          })()}
                        </SelectValue>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {availableAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            {agent.icon}
                            <span>{agent.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading || submitDisabled}
                  className="h-7 w-7"
                >
                  <ImageIcon size={16} />
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  onClick={handleSubmit}
                  disabled={isLoading || isUploading || submitDisabled || (!input.trim() && selectedImages.length === 0)}
                  className="h-7 px-3 text-xs"
                >
                  {isUploading ? (
                    <span>Uploading...</span>
                  ) : (
                    <>
                      <ArrowUp size={14} />
                      <span>Send</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});

ChatInterface.displayName = "ChatInterface";
