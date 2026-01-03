"use client";

import { useCallback, useRef } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import {
  type Message,
  type Assistant,
  type Checkpoint,
} from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";
import type { TodoItem } from "@/app/types/types";
import { useClient } from "@/providers/ClientProvider";
import { useQueryState } from "nuqs";
import { getConfig } from "@/lib/config";
import type { RuntimeConfig } from "@/providers/ChatProvider";

export type StateType ={
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  email?: {
    id?: string;
    subject?: string;
    page_content?: string;
  };
  ui?: any;
};

export function useChat({
  activeAssistant,
  onHistoryRevalidate,
  thread,
  runtimeConfig,
}: {
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
  runtimeConfig?: RuntimeConfig;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const client = useClient();

  const stream = useStream<StateType>({
    assistantId: activeAssistant?.assistant_id || "",
    client: client ?? undefined,
    reconnectOnMount: true,
    threadId: threadId ?? null,
    onThreadId: (newThreadId) => {
      setThreadId(newThreadId);
      // Path B: If we have pending images to patch, do it now that threadId is available
      if (newThreadId && pendingImagesForThread.current.length > 0) {
        patchThreadWithImages(newThreadId, pendingImagesForThread.current);
        pendingImagesForThread.current = [];
      }
    },
    defaultHeaders: { "x-auth-scheme": "langsmith" },
    fetchStateHistory: true,
    // Revalidate thread list when stream finishes, errors, or creates new thread
    onFinish: onHistoryRevalidate,
    onError: onHistoryRevalidate,
    onCreated: onHistoryRevalidate,
    experimental_thread: thread,
    // Note: Authorization header is handled by the Client's defaultHeaders
  });

  // Track images that need to be patched when threadId becomes available (Path B)
  const pendingImagesForThread = useRef<Array<{ doc_id: string; storage_path: string }>>([]);

  // Function to patch thread metadata with images
  const patchThreadWithImages = useCallback(
    async (targetThreadId: string, images: Array<{ doc_id: string; storage_path: string }>) => {
      if (!client || images.length === 0) return;

      try {
        const config = getConfig();
        if (!config?.deploymentUrl) {
          console.error("Cannot patch thread: deploymentUrl not found in config");
          return;
        }

        // Get current thread to merge metadata
        const currentThread = await client.threads.get(targetThreadId);
        const currentMetadata = currentThread.metadata || {};
        const existingImages = Array.isArray(currentMetadata.images) ? currentMetadata.images : [];

        // Merge new images with existing ones (avoid duplicates by doc_id)
        const imageMap = new Map<string, { doc_id: string; storage_path: string }>();
        
        // Add existing images
        existingImages.forEach((img: { doc_id: string; storage_path: string }) => {
          if (img.doc_id) {
            imageMap.set(img.doc_id, img);
          }
        });
        
        // Add new images
        images.forEach((img) => {
          imageMap.set(img.doc_id, img);
        });

        // Create merged images array
        const mergedImages = Array.from(imageMap.values());

        // Patch thread metadata
        const baseUrl = config.deploymentUrl.replace(/\/+$/, "");
        const url = `${baseUrl}/threads/${targetThreadId}`;
        
        console.debug("Patching thread with images:", { url, threadId: targetThreadId, imageCount: mergedImages.length });
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        
        if (config.authToken) {
          headers["Authorization"] = `Bearer ${config.authToken}`;
        }
        
        const apiKey = config.langsmithApiKey || process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";
        if (apiKey) {
          headers["X-Api-Key"] = apiKey;
        }
        
        headers["x-auth-scheme"] = "langsmith";

        const response = await fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            metadata: {
              ...currentMetadata,
              images: mergedImages,
            },
          }),
        }).catch((fetchError) => {
          // Handle network/CORS errors
          console.error("Network error patching thread with images:", fetchError);
          throw fetchError;
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unable to read error response");
          console.error(
            "Failed to patch thread with images:",
            response.status,
            response.statusText,
            errorText.substring(0, 200)
          );
        } else {
          console.debug("Successfully patched thread with images");
        }
      } catch (error) {
        // Log the error but don't throw - this is a best-effort operation
        if (error instanceof Error) {
          console.error("Error patching thread with images:", error.message, error.name);
        } else {
          console.error("Error patching thread with images:", error);
        }
        // Don't throw - this is a best-effort operation
      }
    },
    [client]
  );

  const sendMessage = useCallback(
    (content: string, uploadedImages: Array<{ doc_id: string; storage_url: string; storage_path: string }> = []) => {
      // Build message content with text and/or images
      let messageContent: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
      
      // Build additional_kwargs with image metadata
      const additional_kwargs: Record<string, unknown> = {};
      
      if (uploadedImages.length > 0) {
        // Multimodal message with text and images
        const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
        
        if (content.trim()) {
          contentParts.push({ type: "text" as const, text: content });
        }
        
        // Add each image URL to content
        uploadedImages.forEach((image) => {
          contentParts.push({ type: "image_url" as const, image_url: { url: image.storage_url } });
        });
        
        messageContent = contentParts;
        
        // Add image metadata to additional_kwargs
        // Include doc_id (for database deletion) and storage_path (for storage deletion)
        additional_kwargs.uploaded_images = uploadedImages.map((image) => ({
          doc_id: image.doc_id,
          storage_path: image.storage_path,
        }));
      } else {
        // Text-only message
        messageContent = content;
      }

      const newMessage: Message = { 
        id: uuidv4(), 
        type: "human", 
        content: messageContent,
        additional_kwargs: Object.keys(additional_kwargs).length > 0 ? additional_kwargs : undefined,
      };
      
      // Merge runtime config into configurable
      const config = {
        ...(activeAssistant?.config ?? {}),
        recursion_limit: 100,
        configurable: {
          ...(activeAssistant?.config?.configurable ?? {}),
          ...(runtimeConfig?.model_name ? { model_name: runtimeConfig.model_name } : {}),
          ...(runtimeConfig?.selected_tools ? { selected_tools: runtimeConfig.selected_tools } : {}),
        },
      };

      stream.submit(
        { messages: [newMessage] },
        {
          optimisticValues: (prev) => ({
            messages: [...(prev.messages ?? []), newMessage],
          }),
          config,
        }
      );
      
      // Path A & B: If we have images, patch thread metadata
      if (uploadedImages.length > 0) {
        const imageRefs = uploadedImages.map((image) => ({
          doc_id: image.doc_id,
          storage_path: image.storage_path,
        }));

        if (threadId) {
          // Path A: Thread exists, patch after a small delay to ensure thread is ready
          setTimeout(() => {
            patchThreadWithImages(threadId, imageRefs);
          }, 100);
        } else {
          // Path B: Thread doesn't exist yet, store images to patch when threadId is available
          pendingImagesForThread.current = imageRefs;
        }
      }
      
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
    },
    [stream, activeAssistant?.config, runtimeConfig, onHistoryRevalidate, threadId, patchThreadWithImages]
  );

  const runSingleStep = useCallback(
    (
      messages: Message[],
      checkpoint?: Checkpoint,
      isRerunningSubagent?: boolean,
      optimisticMessages?: Message[]
    ) => {
      if (checkpoint) {
        // Merge runtime config into configurable
        const config = {
          ...(activeAssistant?.config ?? {}),
          configurable: {
            ...(activeAssistant?.config?.configurable ?? {}),
            ...(runtimeConfig?.model_name ? { model_name: runtimeConfig.model_name } : {}),
            ...(runtimeConfig?.selected_tools ? { selected_tools: runtimeConfig.selected_tools } : {}),
          },
        };

        stream.submit(undefined, {
          ...(optimisticMessages
            ? { optimisticValues: { messages: optimisticMessages } }
            : {}),
          config,
          checkpoint: checkpoint,
          ...(isRerunningSubagent
            ? { interruptAfter: ["tools"] }
            : { interruptBefore: ["tools"] }),
        });
      } else {
        // Merge runtime config into configurable
        const config = {
          ...(activeAssistant?.config ?? {}),
          configurable: {
            ...(activeAssistant?.config?.configurable ?? {}),
            ...(runtimeConfig?.model_name ? { model_name: runtimeConfig.model_name } : {}),
            ...(runtimeConfig?.selected_tools ? { selected_tools: runtimeConfig.selected_tools } : {}),
          },
        };

        stream.submit(
          { messages },
          { config, interruptBefore: ["tools"] }
        );
      }
    },
    [stream, activeAssistant?.config, runtimeConfig]
  );

  const setFiles = useCallback(
    async (files: Record<string, string>) => {
      if (!threadId) return;
      // TODO: missing a way how to revalidate the internal state
      // I think we do want to have the ability to externally manage the state
      await client.threads.updateState(threadId, { values: { files } });
    },
    [client, threadId]
  );

  const continueStream = useCallback(
    (hasTaskToolCall?: boolean) => {
      // Merge runtime config into configurable
      const config = {
        ...(activeAssistant?.config ?? {}),
        recursion_limit: 100,
        configurable: {
          ...(activeAssistant?.config?.configurable ?? {}),
          ...(runtimeConfig?.model_name ? { model_name: runtimeConfig.model_name } : {}),
          ...(runtimeConfig?.selected_tools ? { selected_tools: runtimeConfig.selected_tools } : {}),
        },
      };

      stream.submit(undefined, {
        config,
        ...(hasTaskToolCall
          ? { interruptAfter: ["tools"] }
          : { interruptBefore: ["tools"] }),
      });
      // Update thread list when continuing stream
      onHistoryRevalidate?.();
    },
    [stream, activeAssistant?.config, onHistoryRevalidate]
  );

  const markCurrentThreadAsResolved = useCallback(() => {
    stream.submit(null, { command: { goto: "__end__", update: null } });
    // Update thread list when marking thread as resolved
    onHistoryRevalidate?.();
  }, [stream, onHistoryRevalidate]);

  const resumeInterrupt = useCallback(
    (value: any) => {
      stream.submit(null, { command: { resume: value } });
      // Update thread list when resuming from interrupt
      onHistoryRevalidate?.();
    },
    [stream, onHistoryRevalidate]
  );

  const stopStream = useCallback(() => {
    stream.stop();
  }, [stream]);

  return {
    stream,
    todos: stream.values.todos ?? [],
    files: stream.values.files ?? {},
    email: stream.values.email,
    ui: stream.values.ui,
    setFiles,
    messages: stream.messages,
    isLoading: stream.isLoading,
    isThreadLoading: stream.isThreadLoading,
    interrupt: stream.interrupt,
    getMessagesMetadata: stream.getMessagesMetadata,
    sendMessage,
    runSingleStep,
    continueStream,
    stopStream,
    markCurrentThreadAsResolved,
    resumeInterrupt,
    threadId: threadId ?? null,
    setThreadId,
  };
}
