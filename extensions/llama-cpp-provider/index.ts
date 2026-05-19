import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadProviders } from "./config.ts";

// Data-driven provider registration. Reads:
//   1. <pkgRoot>/models.json                       (shipped default)
//   2. $LITTLE_CODER_MODELS_FILE (if set), else
//      $XDG_CONFIG_HOME/little-coder/models.json, else
//      $HOME/.config/little-coder/models.json     (user override; per-provider replace)
//   3. LLAMACPP_BASE_URL / OLLAMA_BASE_URL env    (per-provider baseUrl override)
//
// Issue #13: previously the model list was hardcoded here and models.json was
// only documentation, which made any user edit a no-op until they forked.

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..", "..", "..");

export default function (pi: ExtensionAPI) {
  const result = loadProviders(pkgRoot);

  for (const src of result.sources) {
    if (src.status === "invalid") {
      console.error(`[llama-cpp-provider] ignoring ${src.path}: ${src.error}`);
    }
  }

  const providerCount = Object.keys(result.providers).length;
  if (providerCount === 0) {
    console.error(
      `[llama-cpp-provider] no providers loaded — checked: ${result.sources.map((s) => `${s.path} [${s.status}]`).join(", ")}`,
    );
    return;
  }

  for (const [name, entry] of Object.entries(result.providers)) {
    pi.registerProvider(name, {
      baseUrl: entry.baseUrl,
      apiKey: entry.apiKey,
      api: entry.api,
      models: entry.models,
    });
  }
}
