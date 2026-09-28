import { createEffect, createMemo, createSignal, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { makeEventListener } from "@solid-primitives/event-listener"
import type { FileSearchHandle } from "@opencode-ai/ui/file"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { cloneSelectedLineRange, previewSelectedLines } from "@opencode-ai/ui/pierre/selection-bridge"
import { createLineCommentController } from "@opencode-ai/ui/line-comment-annotations"
import { sampledChecksum } from "@opencode-ai/core/util/encode"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { showToast } from "@opencode-ai/ui/toast"
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { useComments } from "@/context/comments"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { getSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"

const editorTheme = {
  name: "OCodeEditor",
  colors: {
    "editor.background": "transparent",
    "editor.foreground": "var(--ocode-editor-fg)",
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "var(--ocode-syntax-comment)" } },
    { scope: ["string", "constant.other.symbol"], settings: { foreground: "var(--ocode-syntax-string)" } },
    { scope: ["constant.numeric", "constant.language", "variable.language"], settings: { foreground: "var(--ocode-syntax-constant)" } },
    { scope: ["keyword", "storage.type", "storage.modifier"], settings: { foreground: "var(--ocode-syntax-keyword)" } },
    { scope: ["keyword.operator", "punctuation"], settings: { foreground: "var(--ocode-syntax-operator)" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "var(--ocode-syntax-function)" } },
    { scope: ["entity.name.type", "support.type", "support.class", "entity.name.class", "entity.name.tag"], settings: { foreground: "var(--ocode-syntax-type)" } },
    { scope: ["variable.parameter", "variable.other.readwrite"], settings: { foreground: "var(--ocode-syntax-variable)" } },
    { scope: ["variable.other.property", "support.variable.property", "entity.other.attribute-name"], settings: { foreground: "var(--ocode-syntax-property)" } },
  ],
}

const highlighter = createHighlighter({ themes: [editorTheme], langs: [] })

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function languageForPath(filePath: string | undefined): BundledLanguage {
  const value = (filePath ?? "").toLowerCase()
  const name = value.split(/[\\/]/).pop() ?? ""
  const ext = name.split(".").pop() ?? ""
  const map: Record<string, BundledLanguage> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    ps1: "powershell",
    yml: "yaml",
    yaml: "yaml",
  }
  if (name === "package-lock.json" || name === "tsconfig.json") return "json"
  if (name === "dockerfile") return "dockerfile"
  return map[ext] ?? "text"
}

function FileCommentMenu(props: {
  moreLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: VoidFunction
  onDelete: VoidFunction
}) {
  return (
    <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <DropdownMenu gutter={4} placement="bottom-end">
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          size="small"
          class="size-6 rounded-md"
          aria-label={props.moreLabel}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={props.onEdit}>
              <DropdownMenu.ItemLabel>{props.editLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={props.onDelete}>
              <DropdownMenu.ItemLabel>{props.deleteLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  )
}

type ScrollPos = { x: number; y: number }

function createScrollSync(input: { tab: () => string; view: ReturnType<typeof useSessionLayout>["view"] }) {
  let scroll: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  let restoreFrame: number | undefined
  let pending: ScrollPos | undefined
  const [code, setCode] = createSignal<HTMLElement[]>([])

  const getCode = () => {
    const el = scroll
    if (!el) return []

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return []

    const root = host.shadowRoot
    if (!root) return []

    return Array.from(root.querySelectorAll("[data-code]")).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.clientWidth > 0,
    )
  }

  const save = (next: ScrollPos) => {
    pending = next
    if (scrollFrame !== undefined) return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined

      const out = pending
      pending = undefined
      if (!out) return

      input.view().setScroll(input.tab(), out)
    })
  }

  const onCodeScroll = (event: Event) => {
    const el = scroll
    if (!el) return

    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    save({
      x: target.scrollLeft,
      y: el.scrollTop,
    })
  }

  const sync = () => {
    const next = getCode()
    const current = code()
    if (next.length === current.length && next.every((el, i) => el === current[i])) return
    setCode(next)
  }

  const restore = () => {
    const el = scroll
    if (!el) return

    const pos = input.view().scroll(input.tab())
    if (!pos) return

    sync()

    if (code().length > 0) {
      for (const item of code()) {
        if (item.scrollLeft !== pos.x) item.scrollLeft = pos.x
      }
    }

    if (el.scrollTop !== pos.y) el.scrollTop = pos.y
    if (code().length > 0) return
    if (el.scrollLeft !== pos.x) el.scrollLeft = pos.x
  }

  const queueRestore = () => {
    if (restoreFrame !== undefined) return

    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = undefined
      restore()
    })
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (code().length === 0) sync()

    save({
      x: code()[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    })
  }

  createEffect(() => {
    for (const item of code()) makeEventListener(item, "scroll", onCodeScroll)
  })

  const setViewport = (el: HTMLDivElement) => {
    scroll = el
    restore()
  }

  onCleanup(() => {
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame)
  })

  return {
    handleScroll,
    queueRestore,
    setViewport,
  }
}

export function FileTabContent(props: { tab: string }) {
  const file = useFile()
  const comments = useComments()
  const language = useLanguage()
  const prompt = usePrompt()
  const fileComponent = useFileComponent()
  const { sessionKey, tabs, view } = useSessionLayout()
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  }).activeFileTab

  let find: FileSearchHandle | null = null

  const search = {
    register: (handle: FileSearchHandle | null) => {
      find = handle
    },
  }

  const path = createMemo(() => file.pathFromTab(props.tab))
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const editable = createMemo(() => state()?.content?.type === "text" && !state()?.content?.encoding && !state()?.content?.mimeType)
  const [draft, setDraft] = createSignal("")
  const [highlightedDraft, setHighlightedDraft] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const dirty = createMemo(() => editable() && draft() !== contents())
  const cacheKey = createMemo(() => sampledChecksum(contents()))
  const draftLineCount = createMemo(() => Math.max(1, draft().split("\n").length))
  const draftHeight = createMemo(() => `${Math.max(420, draftLineCount() * 20 + 32)}px`)
  const selectedLines = createMemo<SelectedLineRange | null>(() => {
    const p = path()
    if (!p) return null
    if (file.ready()) return (file.selectedLines(p) as SelectedLineRange | undefined) ?? null
    return (getSessionHandoff(sessionKey())?.files[p] as SelectedLineRange | undefined) ?? null
  })
  const scrollSync = createScrollSync({
    tab: () => props.tab,
    view,
  })

  const selectionPreview = (source: string, selection: FileSelection) => {
    return previewSelectedLines(source, {
      start: selection.startLine,
      end: selection.endLine,
    })
  }

  const buildPreview = (filePath: string, selection: FileSelection) => {
    const source = filePath === path() ? contents() : file.get(filePath)?.content?.content
    if (!source) return undefined
    return selectionPreview(source, selection)
  }

  const addCommentToContext = (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => {
    const selection = selectionFromLines(input.selection)
    const preview = input.preview ?? buildPreview(input.file, selection)

    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
  }

  const updateCommentInContext = (input: {
    id: string
    file: string
    selection: SelectedLineRange
    comment: string
  }) => {
    comments.update(input.file, input.id, input.comment)
    const preview = input.file === path() ? buildPreview(input.file, selectionFromLines(input.selection)) : undefined
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(preview ? { preview } : {}),
    })
  }

  const removeCommentFromContext = (input: { id: string; file: string }) => {
    comments.remove(input.file, input.id)
    prompt.context.removeComment(input.file, input.id)
  }

  const fileComments = createMemo(() => {
    const p = path()
    if (!p) return []
    return comments.list(p)
  })

  const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

  const [note, setNote] = createStore({
    openedComment: null as string | null,
    commenting: null as SelectedLineRange | null,
    selected: null as SelectedLineRange | null,
  })

  const syncSelected = (range: SelectedLineRange | null) => {
    const p = path()
    if (!p) return
    file.setSelectedLines(p, range ? cloneSelectedLineRange(range) : null)
  }

  const activeSelection = () => note.selected ?? selectedLines()

  const commentsUi = createLineCommentController({
    comments: fileComments,
    label: language.t("ui.lineComment.submit"),
    draftKey: () => path() ?? props.tab,
    mention: {
      items: file.searchFilesAndDirectories,
    },
    state: {
      opened: () => note.openedComment,
      setOpened: (id) => setNote("openedComment", id),
      selected: () => note.selected,
      setSelected: (range) => setNote("selected", range),
      commenting: () => note.commenting,
      setCommenting: (range) => setNote("commenting", range),
      syncSelected,
      hoverSelected: syncSelected,
    },
    getHoverSelectedRange: activeSelection,
    cancelDraftOnCommentToggle: true,
    clearSelectionOnSelectionEndNull: true,
    onSubmit: ({ comment, selection }) => {
      const p = path()
      if (!p) return
      addCommentToContext({ file: p, selection, comment, origin: "file" })
    },
    onUpdate: ({ id, comment, selection }) => {
      const p = path()
      if (!p) return
      updateCommentInContext({ id, file: p, selection, comment })
    },
    onDelete: (comment) => {
      const p = path()
      if (!p) return
      removeCommentFromContext({ id: comment.id, file: p })
    },
    editSubmitLabel: language.t("common.save"),
    renderCommentActions: (_, controls) => (
      <FileCommentMenu
        moreLabel={language.t("common.moreOptions")}
        editLabel={language.t("common.edit")}
        deleteLabel={language.t("common.delete")}
        onEdit={controls.edit}
        onDelete={controls.remove}
      />
    ),
  })

  createEffect(() => {
    setDraft(contents())
  })

  createEffect(() => {
    const source = draft()
    const filePath = path()
    const lang = languageForPath(filePath)
    const fallback = `<pre class="shiki"><code>${escapeHtml(source || " ")}</code></pre>`
    const run = { cancelled: false }

    if (!editable() || source.length > 300_000) {
      setHighlightedDraft(fallback)
      return
    }

    void highlighter
      .then(async (value) => {
        if (!(lang in bundledLanguages)) return fallback
        if (!value.getLoadedLanguages().includes(lang)) await value.loadLanguage(lang)
        return value.codeToHtml(source || " ", {
          lang,
          theme: "OCodeEditor",
          tabindex: false,
        })
      })
      .then((html) => {
        if (!run.cancelled) setHighlightedDraft(html)
      })
      .catch(() => {
        if (!run.cancelled) setHighlightedDraft(fallback)
      })

    onCleanup(() => {
      run.cancelled = true
    })
  })

  const saveFile = async () => {
    const p = path()
    if (!p || !dirty() || saving()) return
    setSaving(true)
    try {
      await file.save(p, draft())
      showToast({
        title: "Saved",
        description: p,
      })
    } catch (e) {
      showToast({
        variant: "error",
        title: language.t("common.save"),
        description: e instanceof Error ? e.message : language.t("error.chain.unknown"),
      })
    } finally {
      setSaving(false)
    }
  }

  createEffect(() => {
    if (typeof window === "undefined") return

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeFileTab() !== props.tab) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()

      if (key === "s") {
        event.preventDefault()
        event.stopPropagation()
        void saveFile()
        return
      }

      if (key === "f") {
        event.preventDefault()
        event.stopPropagation()
        find?.focus()
      }
    }

    makeEventListener(window, "keydown", onKeyDown, { capture: true })
  })

  createEffect(
    on(
      path,
      () => {
        commentsUi.note.reset()
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const focus = comments.focus()
    const p = path()
    if (!focus || !p) return
    if (focus.file !== p) return
    if (activeFileTab() !== props.tab) return

    const target = fileComments().find((comment) => comment.id === focus.id)
    if (!target) return

    commentsUi.note.openComment(target.id, target.selection, { cancelDraft: true })
    requestAnimationFrame(() => comments.clearFocus())
  })

  let prev = {
    loaded: false,
    ready: false,
    active: false,
  }

  createEffect(() => {
    const loaded = !!state()?.loaded
    const ready = file.ready()
    const active = activeFileTab() === props.tab
    const restore = (loaded && !prev.loaded) || (ready && !prev.ready) || (active && loaded && !prev.active)
    prev = { loaded, ready, active }
    if (!restore) return
    scrollSync.queueRestore()
  })

  const renderEditableFile = () => (
    <div class="ocode-editor-surface relative min-h-full overflow-hidden pb-24">
      <div class="sticky top-0 z-20 flex h-9 items-center justify-between border-b border-border-weaker-base bg-background-stronger/95 px-3 backdrop-blur">
        <div class="min-w-0 text-12-regular text-text-weak">
          <span class="truncate">{path()}</span>
          <Show when={dirty()}>
            <span class="ml-2 text-text-base">Modified</span>
          </Show>
        </div>
        <button
          type="button"
          class="h-6 rounded-md border border-border-weaker-base px-2 text-12-medium text-text-base hover:bg-surface-raised-base-hover disabled:cursor-default disabled:opacity-45"
          disabled={!dirty() || saving()}
          onClick={() => void saveFile()}
        >
          {saving() ? language.t("common.saving") : language.t("common.save")}
        </button>
      </div>
      <textarea
        class="ocode-edit-input relative z-10 block min-h-[calc(100vh-180px)] w-full resize-none border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-[20px] outline-none"
        spellcheck={false}
        style={{ height: draftHeight() }}
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
      <pre class="ocode-edit-highlight pointer-events-none absolute inset-x-0 top-9 z-0 px-4 py-3" innerHTML={highlightedDraft()} />
    </div>
  )

  const renderFile = (source: string) => (
    <div class="ocode-editor-surface relative min-h-full overflow-hidden pb-24">
      <Dynamic
        component={fileComponent}
        mode="text"
        file={{
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey(),
        }}
        enableLineSelection
        enableHoverUtility
        selectedLines={activeSelection()}
        commentedLines={commentedLines()}
        onRendered={() => {
          scrollSync.queueRestore()
        }}
        annotations={commentsUi.annotations()}
        renderAnnotation={commentsUi.renderAnnotation}
        renderHoverUtility={commentsUi.renderHoverUtility}
        onLineSelected={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelected(range)
        }}
        onLineNumberSelectionEnd={commentsUi.onLineNumberSelectionEnd}
        onLineSelectionEnd={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelectionEnd(range)
        }}
        search={search}
        class="ocode-code-view select-text"
        media={{
          mode: "auto",
          path: path(),
          current: state()?.content,
          onLoad: scrollSync.queueRestore,
          onError: (args: { kind: "image" | "audio" | "svg" }) => {
            if (args.kind !== "svg") return
            showToast({
              variant: "error",
              title: language.t("toast.file.loadFailed.title"),
            })
          },
        }}
      />
    </div>
  )

  return (
    <Tabs.Content value={props.tab} class="relative h-full bg-background-stronger">
      <ScrollView class="h-full ocode-editor-scroll" viewportRef={scrollSync.setViewport} onScroll={scrollSync.handleScroll as any}>
        <Switch>
          <Match when={state()?.loaded && editable()}>{renderEditableFile()}</Match>
          <Match when={state()?.loaded}>{renderFile(contents())}</Match>
          <Match when={state()?.loading}>
            <div class="px-4 py-3 text-12-regular text-text-weak">{language.t("common.loading")}...</div>
          </Match>
          <Match when={state()?.error}>{(err) => <div class="px-4 py-3 text-12-regular text-text-weak">{err()}</div>}</Match>
        </Switch>
      </ScrollView>
    </Tabs.Content>
  )
}
