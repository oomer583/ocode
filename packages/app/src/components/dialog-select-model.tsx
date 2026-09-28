import { Popover as Kobalte } from "@kobalte/core/popover"
import { Component, ComponentProps, createMemo, JSX, Show, ValidComponent } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tag } from "@opencode-ai/ui/tag"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ModelTooltip } from "./model-tooltip"
import { useLanguage } from "@/context/language"

const MVP_MODEL_SELECTOR = false

const isFree = (_provider: string, cost: { input: number } | undefined) =>
  !!cost && cost.input === 0

const providerPriority = (id: string) => {
  if (id === "openai") return 0
  if (id === "anthropic") return 1
  if (id === "google") return 2
  if (id === "ollama") return 3
  if (id === "lmstudio" || id === "lm-studio") return 4
  if (id === "opencode" || id === "opencode-go") return 9
  return 8
}

const providerLabel = (id: string, name: string) => {
  if (id === "openai") return "OpenAI"
  if (id === "anthropic") return "Anthropic"
  if (id === "google") return "Google"
  if (id === "ollama") return "Ollama"
  if (id === "lmstudio" || id === "lm-studio") return "LM Studio"
  if (id === "opencode") return name
  if (id === "opencode-go") return name
  return name
}

type ModelState = ReturnType<typeof useLocal>["model"]

const ModelList: Component<{
  provider?: string
  class?: string
  onSelect: () => void
  action?: JSX.Element
  model?: ModelState
}> = (props) => {
  const model = props.model ?? useLocal().model
  const language = useLanguage()

  const models = createMemo(() =>
    model
      .list()
      .filter((m) => model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true)),
  )
  const visibleModels = createMemo(() => {
    if (!MVP_MODEL_SELECTOR) return models()
    return models().filter((m) => m.provider.id === "opencode").slice(0, 1)
  })

  return (
    <div class={`flex-1 min-h-0 flex flex-col ${props.class ?? ""}`}>
      <List
        class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
        search={{
          placeholder: language.t("dialog.model.search.placeholder"),
          autofocus: true,
          action: MVP_MODEL_SELECTOR ? undefined : props.action,
        }}
        emptyMessage={language.t("dialog.model.empty")}
        key={(x) => `${x.provider.id}:${x.id}`}
        items={visibleModels}
        current={model.current()}
        filterKeys={["provider.name", "name", "id"]}
        sortBy={(a, b) =>
          providerPriority(a.provider.id) - providerPriority(b.provider.id) || a.name.localeCompare(b.name)
        }
        groupBy={(x) => (x.id === "openrouter/free" ? "via OCode" : "via " + providerLabel(x.provider.id, x.provider.name))}
        sortGroupsBy={(a, b) => {
          const oncelik = (g: any) => (g.items[0].id === "openrouter/free" ? -1 : providerPriority(g.items[0].provider.id)); return oncelik(a) - oncelik(b)
        }}
        itemWrapper={(item, node) => (
          <Tooltip
            class="w-full"
            placement="right-start"
            gutter={12}
            value={<ModelTooltip model={item} latest={item.latest} free={isFree(item.provider.id, item.cost)} />}
          >
            {node}
          </Tooltip>
        )}
        onSelect={(x) => {
          model.set(x ? { modelID: x.id, providerID: x.provider.id } : undefined, {
            recent: true,
          })
          props.onSelect()
        }}
      >
        {(i) => (
          <div class="w-full min-w-0 flex items-center gap-2 py-0.5">
            <div class="min-w-0 flex-1 flex flex-col gap-0.5">
              <span class="truncate text-13-medium text-text-strong">{i.name}</span>
              
            </div>
            <div class="shrink-0 flex items-center gap-1">
              <Show when={(/:free$/.test(i.id) || /\bfree\b/i.test(i.name))}><Tag>{language.t("model.tag.free")}</Tag></Show><Show when={!(/:free$/.test(i.id) || /\bfree\b/i.test(i.name))}><Tag>Paid API</Tag></Show>
            </div>
          </div>
        )}
      </List>
      <div class="shrink-0 border-t border-border-weaker-base px-2.5 py-2 text-11-regular text-text-weak leading-snug">
        {language.t("dialog.model.mvpNote")}
      </div>
      <div class="hidden">
        OCode ÅŸu an sade bir MVP deneyimine odaklanÄ±yor. Daha fazla model ve entegrasyon gelecek sÃ¼rÃ¼mlerde
        eklenecek.
      </div>
    </div>
  )
}

type ModelSelectorTriggerProps = Omit<ComponentProps<typeof Kobalte.Trigger>, "as" | "ref">
type Dismiss = "escape" | "outside" | "select" | "manage" | "provider"

export function ModelSelectorPopover(props: {
  provider?: string
  model?: ModelState
  children?: JSX.Element
  triggerAs?: ValidComponent
  triggerProps?: ModelSelectorTriggerProps
  onClose?: (cause: "escape" | "select") => void
}) {
  const [store, setStore] = createStore<{
    open: boolean
    dismiss: Dismiss | null
  }>({
    open: false,
    dismiss: null,
  })
  const dialog = useDialog()

  const close = (dismiss: Dismiss) => {
    setStore("dismiss", dismiss)
    setStore("open", false)
  }

  const handleManage = () => {
    close("manage")
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }

  const handleConnectProvider = () => {
    close("provider")
    void import("./dialog-select-provider").then((x) => {
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }
  const language = useLanguage()

  return (
    <Kobalte
      open={store.open}
      onOpenChange={(next) => {
        if (next) setStore("dismiss", null)
        setStore("open", next)
      }}
      modal={false}
      placement="top-start"
      gutter={4}
    >
      <Kobalte.Trigger as={props.triggerAs ?? "div"} {...props.triggerProps}>
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content
          class="w-[320px] h-[360px] flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
          onEscapeKeyDown={(event) => {
            close("escape")
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDownOutside={() => close("outside")}
          onFocusOutside={() => close("outside")}
          onCloseAutoFocus={(event) => {
            const dismiss = store.dismiss
            if (dismiss === "outside") event.preventDefault()
            if (dismiss === "escape" || dismiss === "select") {
              event.preventDefault()
              props.onClose?.(dismiss)
            }
            setStore("dismiss", null)
          }}
        >
          <Kobalte.Title class="sr-only">{language.t("dialog.model.select.title")}</Kobalte.Title>
          <ModelList
            provider={props.provider}
            model={props.model}
            onSelect={() => close("select")}
            class="p-1"
            action={
              <div class="flex items-center gap-1">
                <Tooltip placement="top" value={language.t("command.provider.connect")}>
                  <IconButton
                    icon="plus-small"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("command.provider.connect")}
                    onClick={handleConnectProvider}
                  />
                </Tooltip>
                <Tooltip placement="top" value={language.t("dialog.model.manage")}>
                  <IconButton
                    icon="sliders"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("dialog.model.manage")}
                    onClick={handleManage}
                  />
                </Tooltip>
              </div>
            }
          />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export const DialogSelectModel: Component<{ provider?: string; model?: ModelState }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

  const provider = () => {
    void import("./dialog-select-provider").then((x) => {
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }

  const manage = () => {
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }

  return (
    <Dialog
      title={language.t("dialog.model.select.title")}
      action={
        MVP_MODEL_SELECTOR ? undefined : (
        <Button class="h-7 -my-1 text-14-medium" icon="plus-small" tabIndex={-1} onClick={provider}>
          {language.t("command.provider.connect")}
        </Button>
        )
      }
    >
      <ModelList provider={props.provider} model={props.model} onSelect={() => dialog.close()} />
      <Show when={!MVP_MODEL_SELECTOR}>
        <Button variant="ghost" class="ml-3 mt-5 mb-6 text-text-base self-start" onClick={manage}>
          {language.t("dialog.model.manage")}
        </Button>
      </Show>
    </Dialog>
  )
}
