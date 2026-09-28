import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"

export const [drawerOpen, setDrawerOpen] = createSignal(false)

export type DrawerProject = {
  worktree: string
  at: number
}

function folderName(worktree: string) {
  const parts = worktree.replaceAll("\\", "/").split("/").filter(Boolean)
  return parts[parts.length - 1] ?? worktree
}

export function ProjectDrawer(props: {
  open: boolean
  onClose: () => void
  projects: DrawerProject[]
  homedir: string
  formatRelative: (time: number) => string
  onOpenProject: (worktree: string) => void
  onNewProject: () => void
}) {
  const [query, setQuery] = createSignal("")

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return props.projects
    return props.projects.filter((project) => project.worktree.toLowerCase().includes(q))
  })

  createEffect(() => {
    if (!props.open) return
    setQuery("")
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose()
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  return (
    <>
      <div
        classList={{
          "fixed left-0 right-0 bottom-0 top-10 z-40 bg-black/40 transition-opacity duration-200": true,
          "opacity-100": props.open,
          "opacity-0 pointer-events-none": !props.open,
        }}
        onClick={() => props.onClose()}
      />
      <aside
        aria-hidden={!props.open}
        classList={{
          "fixed left-0 bottom-0 top-10 z-50 w-[340px] flex flex-col bg-background-base border-r border-border-subtle transition-transform duration-200 ease-out": true,
          "translate-x-0": props.open,
          "-translate-x-full pointer-events-none": !props.open,
        }}
      >
        <div class="shrink-0 flex items-center justify-between gap-2 px-4 py-3">
          <div class="text-14-medium text-text-strong">All projects</div>
          <Button
            variant="ghost"
            icon="close-small"
            class="w-7 h-7 p-0"
            aria-label="Close"
            onClick={() => props.onClose()}
          />
        </div>

        <div class="shrink-0 px-4 pb-2">
          <Button
            icon="folder-add-left"
            size="normal"
            class="w-full justify-start pl-2 pr-3"
            onClick={() => {
              props.onClose()
              props.onNewProject()
            }}
          >
            New project
          </Button>
        </div>

        <Show when={props.projects.length > 6}>
          <div class="shrink-0 px-4 pb-2">
            <div class="flex items-center gap-2 h-8 rounded-md border border-border-subtle bg-surface-base px-2">
              <Icon name="magnifying-glass" size="small" class="text-icon-weak shrink-0" />
              <input
                class="min-w-0 flex-1 bg-transparent text-13-regular text-text-strong outline-none placeholder:text-text-disabled"
                type="text"
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search projects"
              />
            </div>
          </div>
        </Show>

        <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="px-3 py-6 text-center text-12-regular text-text-weak">
                {props.projects.length === 0 ? "No projects yet" : "No match"}
              </div>
            }
          >
            <ul class="flex flex-col gap-0.5">
              <For each={filtered()}>
                {(project) => (
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-surface-base"
                      onClick={() => {
                        props.onClose()
                        props.onOpenProject(project.worktree)
                      }}
                    >
                      <Icon name="folder" size="small" class="mt-0.5 shrink-0 text-icon-weak" />
                      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span class="block truncate text-13-medium text-text-strong">
                          {folderName(project.worktree)}
                        </span>
                        <span class="block truncate text-11-regular text-text-weak">
                          {project.worktree.replace(props.homedir, "~")}
                        </span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div class="shrink-0 border-t border-border-subtle px-4 py-2 text-11-regular text-text-weak">
          {props.projects.length} project{props.projects.length === 1 ? "" : "s"}
        </div>
      </aside>
    </>
  )
}