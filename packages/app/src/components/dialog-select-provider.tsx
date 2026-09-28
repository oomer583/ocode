import { Component, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { popularProviders, providerUXCategory, providerUXCategoryLabel, useProviders } from "@/hooks/use-providers"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Tag } from "@opencode-ai/ui/tag"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "./dialog-custom-provider"

const CUSTOM_ID = "_custom"

export const DialogSelectProvider: Component = () => {
  const dialog = useDialog()
  const providers = useProviders()
  const language = useLanguage()

  const customLabel = () => language.t("settings.providers.tag.custom")
  const category = (id: string, name?: string) => {
    if (id === CUSTOM_ID) return "advanced"
    return providerUXCategory({ id, name })
  }
  const categoryRank = (id: string, name?: string) => {
    const value = category(id, name)
    if (value === "free-local") return 0
    if (value === "api-key") return 1
    return 2
  }
  const providerName = (id: string, name: string) => {
    if (id === "opencode") return "OCode Free"
    if (id === "opencode-go") return "OCode Local"
    return name
  }
  const note = (id: string) => {
    if (id === "opencode") return "Free-friendly hosted/local starter option."
    if (id === "opencode-go") return "Local-first OCode runtime option."
    if (id === "ollama") return "Run local models from Ollama."
    if (id === "lmstudio" || id === "lm-studio") return "Use models served by LM Studio."
    if (id === "anthropic") return "Use your Anthropic API key."
    if (id === "openai") return "Use your OpenAI API key."
    if (id.startsWith("github-copilot")) return language.t("dialog.provider.copilot.note")
  }

  return (
    <Dialog title={language.t("command.provider.connect")} transition>
      <List
        search={{ placeholder: language.t("dialog.provider.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.provider.empty")}
        activeIcon="plus-small"
        key={(x) => x?.id}
        items={() => {
          language.locale()
          return [{ id: CUSTOM_ID, name: customLabel() }, ...providers.all()]
        }}
        filterKeys={["id", "name"]}
        groupBy={(x) => providerUXCategoryLabel(category(x.id, x.name))}
        sortBy={(a, b) => {
          if (a.id === CUSTOM_ID) return -1
          if (b.id === CUSTOM_ID) return 1
          const aRank = categoryRank(a.id, a.name)
          const bRank = categoryRank(b.id, b.name)
          if (aRank !== bRank) return aRank - bRank
          if (popularProviders.includes(a.id) && popularProviders.includes(b.id))
            return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id)
          return a.name.localeCompare(b.name)
        }}
        sortGroupsBy={(a, b) => {
          const order = ["Free / Local", "Bring Your Own API Key", "Advanced / Custom"]
          return order.indexOf(a.category) - order.indexOf(b.category)
        }}
        onSelect={(x) => {
          if (!x) return
          if (x.id === CUSTOM_ID) {
            dialog.show(() => <DialogCustomProvider back="providers" />)
            return
          }
          dialog.show(() => <DialogConnectProvider provider={x.id} />)
        }}
      >
        {(i) => (
          <div class="px-1.25 w-full flex items-center gap-x-3">
            <ProviderIcon data-slot="list-item-extra-icon" id={i.id} />
            <span>{providerName(i.id, i.name)}</span>
            <Show when={i.id === CUSTOM_ID}>
              <Tag>{language.t("settings.providers.tag.custom")}</Tag>
            </Show>
            <Show when={category(i.id, i.name) === "free-local"}>
              <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
            </Show>
            <Show when={note(i.id)}>{(value) => <div class="text-13-regular text-text-weak">{value()}</div>}</Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
