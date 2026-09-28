import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import { createMemo } from "solid-js"

export const popularProviders = [
  "opencode",
  "opencode-go",
  "ollama",
  "lmstudio",
  "lm-studio",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]
const popularProviderSet = new Set(popularProviders)
const localProviderIDs = new Set(["opencode", "opencode-go", "ollama", "lmstudio", "lm-studio", "local", "local-llm"])
const advancedProviderIDs = new Set(["openrouter", "vercel"])

export type ProviderUXCategory = "free-local" | "api-key" | "advanced"

export function providerUXCategory(provider: { id: string; name?: string }): ProviderUXCategory {
  const name = provider.name?.toLowerCase() ?? ""
  if (localProviderIDs.has(provider.id) || name.includes("ollama") || name.includes("lm studio")) return "free-local"
  if (advancedProviderIDs.has(provider.id)) return "advanced"
  return "api-key"
}

export function providerUXCategoryLabel(category: ProviderUXCategory) {
  if (category === "free-local") return "Free / Local"
  if (category === "api-key") return "Bring Your Own API Key"
  return "Advanced / Custom"
}

export function providerUXDescription(category: ProviderUXCategory) {
  if (category === "free-local") return "Start with local or free-friendly options before adding paid APIs."
  if (category === "api-key") return "Connect the API keys you already own. OCode does not sell model access."
  return "Use routers, gateways, or OpenAI-compatible custom providers."
}

export function useProviders() {
  const globalSync = useGlobalSync()
  const params = useParams()
  const dir = createMemo(() => decode64(params.dir) ?? "")
  const providers = () => {
    if (dir()) {
      const [projectStore] = globalSync.child(dir())
      if (projectStore.provider_ready) return projectStore.provider
    }
    return globalSync.data.provider
  }
  return {
    all: () => providers().all,
    default: () => providers().default,
    popular: () => providers().all.filter((p) => popularProviderSet.has(p.id)),
    connected: () => {
      const connected = new Set(providers().connected)
      return providers().all.filter((p) => connected.has(p.id))
    },
    paid: () => {
      const connected = new Set(providers().connected)
      return providers().all.filter(
        (p) => connected.has(p.id) && (p.id !== "opencode" || Object.values(p.models).some((m) => m.cost?.input)),
      )
    },
  }
}
