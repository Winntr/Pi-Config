// Pure config-loading logic for the providers extension. Kept separate from
// the pi wiring in index.ts so it can be unit-tested without a pi runtime.
//
// Schema (all required unless noted):
//   {
//     "providers": {
//       "<name>": {
//         "api": "openai-completions",
//         "baseUrl": "http://...",
//         "apiKey": "ENV_VAR_NAME",
//         "models": [ { id, name, reasoning, input, contextWindow, maxTokens, cost }, ... ]
//       }, ...
//     }
//   }

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProviderModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface ProviderEntry {
  api: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModelEntry[];
}

export interface ModelsFile {
  providers: Record<string, ProviderEntry>;
}

export interface LoadResult {
  providers: Record<string, ProviderEntry>;
  /** Files that were attempted, in resolution order. Useful for diagnostics. */
  sources: { path: string; status: "ok" | "missing" | "invalid"; error?: string }[];
}

/** Provider env knob: if set, overrides the provider's baseUrl. Originally a
 *  back-compat shim for the two providers we shipped before the data-driven
 *  refactor; kept as the per-provider env-override pattern for any provider
 *  whose baseUrl changes between deployments. */
const LEGACY_BASE_URL_ENV: Record<string, string> = {
  llamacpp: "LLAMACPP_BASE_URL",
  ollama: "OLLAMA_BASE_URL",
  lmstudio: "LMSTUDIO_BASE_URL",
};

/** Resolution order for the user-override file. First existing path wins. */
export function resolveOverridePath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.LITTLE_CODER_MODELS_FILE) return env.LITTLE_CODER_MODELS_FILE;
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "little-coder", "models.json");
  if (env.HOME) return join(env.HOME, ".config", "little-coder", "models.json");
  return undefined;
}

function parseModelsFile(raw: string): ModelsFile {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !parsed.providers || typeof parsed.providers !== "object") {
    throw new Error("expected top-level { providers: { ... } }");
  }
  return parsed as ModelsFile;
}

function readIfPresent(path: string): { kind: "ok"; data: ModelsFile } | { kind: "missing" } | { kind: "invalid"; error: string } {
  if (!existsSync(path)) return { kind: "missing" };
  try {
    const raw = readFileSync(path, "utf-8");
    return { kind: "ok", data: parseModelsFile(raw) };
  } catch (err) {
    return { kind: "invalid", error: err instanceof Error ? err.message : String(err) };
  }
}

export function applyEnvOverrides(providers: Record<string, ProviderEntry>, env: NodeJS.ProcessEnv = process.env): Record<string, ProviderEntry> {
  const out: Record<string, ProviderEntry> = {};
  for (const [name, entry] of Object.entries(providers)) {
    const envVar = LEGACY_BASE_URL_ENV[name];
    if (envVar && env[envVar]) {
      out[name] = { ...entry, baseUrl: env[envVar]! };
    } else {
      out[name] = entry;
    }
  }
  return out;
}

/**
 * Merge: user file's providers fully replace package providers with the same
 * key. Providers only in the user file are added. Providers only in the
 * package default are kept. (We deliberately avoid deep per-model merging —
 * the user redeclares the whole provider entry if they want to change it,
 * which is far less surprising than "your override silently inherited fields
 * from a future package release.")
 */
export function mergeProviders(
  pkgDefault: Record<string, ProviderEntry>,
  userOverride: Record<string, ProviderEntry> | undefined,
): Record<string, ProviderEntry> {
  if (!userOverride) return { ...pkgDefault };
  return { ...pkgDefault, ...userOverride };
}

/**
 * Load the package default models.json + (optionally) the user override file,
 * apply env-var baseUrl overrides for the legacy providers, and return the
 * merged provider map plus diagnostics for each source.
 */
export function loadProviders(pkgRoot: string, env: NodeJS.ProcessEnv = process.env): LoadResult {
  const sources: LoadResult["sources"] = [];
  const defaultPath = join(pkgRoot, "models.json");
  const defaultRead = readIfPresent(defaultPath);
  let pkgDefault: Record<string, ProviderEntry> = {};
  if (defaultRead.kind === "ok") {
    pkgDefault = defaultRead.data.providers;
    sources.push({ path: defaultPath, status: "ok" });
  } else if (defaultRead.kind === "missing") {
    sources.push({ path: defaultPath, status: "missing" });
  } else {
    sources.push({ path: defaultPath, status: "invalid", error: defaultRead.error });
  }

  const overridePath = resolveOverridePath(env);
  let userOverride: Record<string, ProviderEntry> | undefined;
  if (overridePath) {
    const userRead = readIfPresent(overridePath);
    if (userRead.kind === "ok") {
      userOverride = userRead.data.providers;
      sources.push({ path: overridePath, status: "ok" });
    } else if (userRead.kind === "missing") {
      sources.push({ path: overridePath, status: "missing" });
    } else {
      sources.push({ path: overridePath, status: "invalid", error: userRead.error });
    }
  }

  const merged = mergeProviders(pkgDefault, userOverride);
  const withEnv = applyEnvOverrides(merged, env);
  return { providers: withEnv, sources };
}
