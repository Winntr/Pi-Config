import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";

// Session-scoped state for escalation
let consecutiveErrors = 0;
let isEscalated = false;

// Configurable constants
const MAX_LOCAL_ERRORS = 3;

// Active fallback configuration
let fallbackProvider = "github-copilot";
let fallbackModel = "claude-sonnet-4.6";

// We'll capture the model registry when a session starts to use it in completions
let globalModelRegistry: ModelRegistry | null = null;

export default function (pi: ExtensionAPI) {
  // Register the slash command
  pi.registerCommand("panic-model", {
    description: "Set the fallback model for panic escalation (e.g. github-copilot/claude-sonnet-4.6)",
    getArgumentCompletions: (prefix: string) => {
      if (!globalModelRegistry) return [];
      
      const models = globalModelRegistry.getAll().map(m => `${m.provider}/${m.id}`);
      return models
        .filter(m => m.toLowerCase().includes(prefix.toLowerCase()))
        .map(m => ({ label: m, value: m }));
    },
    handler: async (args: string, ctx) => {
      if (!globalModelRegistry) {
        ctx.ui.notify("Model registry not available yet.", "error");
        return;
      }

      const models = globalModelRegistry.getAll().map(m => `${m.provider}/${m.id}`);
      
      const choice = await ctx.ui.select(
        "Select fallback model for panic escalation:",
        models
      );
      
      if (!choice) {
        ctx.ui.notify("Panic model selection cancelled.", "info");
        return;
      }

      const parts = choice.split("/");
      fallbackProvider = parts[0];
      fallbackModel = parts.slice(1).join("/");

      ctx.ui.notify(`Panic model successfully updated to ${fallbackProvider}/${fallbackModel}`, "success");
    }
  });

  // Reset state on new session
  pi.on("session_start", (event, ctx) => {
    consecutiveErrors = 0;
    isEscalated = false;
    globalModelRegistry = ctx.modelRegistry;
  });

  // Track tool failures to detect when the local model is thrashing
  pi.on("tool_execution_end", async (event) => {
    const result = (event as any).result;
    
    // Check if the tool execution resulted in an error or failed command
    if (result && (result.error || (result.exitCode !== undefined && result.exitCode !== 0))) {
      consecutiveErrors++;
    } else {
      // If it successfully completed a tool, reset the counter
      consecutiveErrors = 0;
    }
  });

  // Intercept the provider request to trigger and route the escalation
  pi.on("before_provider_request", async (event, ctx) => {
    // 1. Check if we need to trigger escalation for the first time
    if (consecutiveErrors >= MAX_LOCAL_ERRORS && !isEscalated) {
      isEscalated = true;
      
      // Notify the user in the TUI
      ctx.ui.notify(
        `🚨 Local model panicked after ${consecutiveErrors} consecutive errors. Escalating to ${fallbackProvider}/${fallbackModel}...`,
        "error"
      );
      
      // Inject a steering message so the large model knows it is taking over
      pi.sendUserMessage(
        `[SYSTEM OVERRIDE]: The previous local model failed to complete the last few steps and generated consecutive errors. You are a highly capable frontier model taking over the session. Please carefully review the recent tool errors, identify the root cause of the failure loop, and correct the approach to complete the user's task.`,
        { deliverAs: "steer" }
      );
    }

    // 2. If we are escalated, redirect the request to the fallback provider
    if (isEscalated) {
      const payload: any = (event as any).payload;
      
      // Rewrite the active model context so Pi routes it correctly
      if (ctx.model) {
        ctx.model.provider = fallbackProvider;
        ctx.model.id = fallbackModel;
      }
      
      // Return the mutated payload ensuring the model string matches the fallback
      return { 
        ...payload, 
        model: fallbackModel 
      };
    }
    
    // If not escalated, return undefined to let the request proceed normally
    return undefined;
  });
}