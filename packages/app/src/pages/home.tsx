import { createEffect, createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { showToast } from "@opencode-ai/ui/toast"
import { Persist } from "@/utils/persist"
import { pathKey } from "@/utils/path-key"
import { latestRootSession } from "./layout/helpers"
import { ProjectDrawer, drawerOpen, setDrawerOpen } from "@/components/project-drawer"

const workspaceStorage = "ocode.workspace.dat"
const workspaceRootKey = "projectRoot"
const recentProjectsKey = "recentProjects"
const relativeUnits = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1_000],
] as const

type RecentProject = {
  worktree: string
  at: number
}

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const homedir = createMemo(() => sync.data.path.home)
  const relativeTime = createMemo(() => new Intl.RelativeTimeFormat(language.intl(), { numeric: "auto" }))
  const formatRelative = (time: number) => {
    if (time <= 0) return "Local"
    const diff = time - Date.now()
    const unit = relativeUnits.find((entry) => Math.abs(diff) >= entry[1]) ?? relativeUnits.at(-1)!
    return relativeTime().format(Math.round(diff / unit[1]), unit[0])
  }
  const [validPaths, setValidPaths] = createSignal<Record<string, boolean>>({})
  const [storedRecent, setStoredRecent] = createSignal<RecentProject[]>([])
  const [projectRoot, setProjectRoot] = createSignal<string>()
  const [projectLibrary, setProjectLibrary] = createSignal<RecentProject[]>([])
  const recentCandidates = createMemo(() => {
    const byPath = new Map<string, RecentProject>()
    const add = (project: RecentProject) => {
      if (isNoisyProject(project)) return
      const key = pathKey(project.worktree)
      const previous = byPath.get(key)
      if (!previous || project.at > previous.at) byPath.set(key, project)
    }

    for (const project of sync.data.project) {
      add({ worktree: project.worktree, at: project.time.updated ?? project.time.created })
    }

    for (const project of storedRecent()) {
      add(project)
    }

    for (const project of layout.projects.list()) {
      add({ worktree: project.worktree, at: server.projects.last() === project.worktree ? Date.now() : 0 })
    }

    return [...byPath.values()].sort((a, b) => b.at - a.at).slice(0, 5)
  })
  const recent = createMemo(() => {
    const validated = validPaths()
    return recentCandidates().filter((project) => validated[pathKey(project.worktree)] !== false)
  })

  const allProjects = createMemo(() => {
    const byPath = new Map<string, RecentProject>()
    for (const project of [...recent(), ...projectLibrary()]) {
      const key = pathKey(project.worktree)
      const previous = byPath.get(key)
      if (!previous || project.at > previous.at) byPath.set(key, project)
    }
    return [...byPath.values()].sort((a, b) => b.at - a.at)
  })
  let validationRun = 0
  createEffect(() => {
    const projects = recentCandidates()
    const exists = platform.directoryExists
    if (!exists) {
      setValidPaths(Object.fromEntries(projects.map((project) => [pathKey(project.worktree), true])))
      return
    }

    const run = ++validationRun
    void Promise.all(
      projects.map((project) => exists(project.worktree).then((ok) => [pathKey(project.worktree), ok] as const)),
    ).then((entries) => {
      if (run !== validationRun) return
      setValidPaths(Object.fromEntries(entries))
    })
  })

  onMount(() => {
    void loadWorkspaceState()
  })

  async function loadWorkspaceState() {
    const storage = platform.storage?.(workspaceStorage)
    if (!storage) return
    const raw = await Promise.resolve(storage.getItem(recentProjectsKey))
    setStoredRecent(parseRecentProjects(raw))
    const root = await Promise.resolve(storage.getItem(workspaceRootKey))
    setProjectRoot(root ?? undefined)
    if (root) await loadProjectLibrary(root)
  }

  async function loadProjectLibrary(root = projectRoot()) {
    if (!root || !platform.listProjectFolders) return
    setProjectLibrary((await platform.listProjectFolders(root)).filter((project) => !isNoisyProject(project)))
  }

  async function saveRecentProject(directory: string) {
    const next = [
      { worktree: directory, at: Date.now() },
      ...storedRecent().filter((project) => pathKey(project.worktree) !== pathKey(directory)),
    ].slice(0, 10)
    setStoredRecent(next)
    await Promise.resolve(platform.storage?.(workspaceStorage)?.setItem(recentProjectsKey, JSON.stringify(next)))
  }

  async function resetProjectMemory(directory: string) {
    const target = Persist.workspace(directory, "project-memory", ["project-memory.v1"])
    const storage = platform.storage?.(target.storage)
    if (!storage) return

    const raw = await Promise.resolve(storage.getItem(target.key))
    const parsed = parseProjectMemory(raw)
    await Promise.resolve(
      storage.setItem(
        target.key,
        JSON.stringify({
          open: false,
          projectName: "",
          stack: typeof parsed?.stack === "string" ? parsed.stack : "",
          preferences: "",
          rules: "",
          notes: "",
        }),
      ),
    )
  }

  async function openProject(directory: string) {
    const existing = layout.projects.list().find((project) => pathKey(project.worktree) === pathKey(directory))
    const target = existing?.worktree ?? directory
    void platform.ensureProjectRules?.(target).catch(() => {})
    void resetProjectMemory(target)
    void saveRecentProject(target)
    layout.projects.open(target)
    server.projects.touch(target)
    await sync.project.loadSessions(target)
    const session = latestRootSession([sync.child(target, { bootstrap: false })[0]], Date.now())
    navigate(`/${base64Encode(target)}/session${session ? `/${session.id}` : ""}`)
  }

  async function chooseProjectRoot() {
    if (!platform.openDirectoryPickerDialog) return
    const result = await platform.openDirectoryPickerDialog({
      title: language.t("home.projectRoot.title"),
      multiple: false,
    })
    const directory = Array.isArray(result) ? result[0] : result
    if (!directory) return
    await platform.storage?.(workspaceStorage)?.setItem(workspaceRootKey, directory)
    setProjectRoot(directory)
    await loadProjectLibrary(directory)
    return directory
  }

  async function askProjectName() {
    return new Promise<string | undefined>((resolve) => {
      dialog.show(
        () => {
          const [name, setName] = createSignal("")
          let input: HTMLInputElement | undefined
          const finish = () => {
            resolve((input?.value ?? name()).trim())
            dialog.close()
          }
          const submit = (event: SubmitEvent) => {
            event.preventDefault()
            finish()
          }

          return (
            <Dialog title={language.t("home.createProject.nameTitle")}>
              <form onSubmit={submit} class="flex w-[min(420px,calc(100vw-48px))] flex-col gap-4 px-1 pb-1">
                <label class="flex flex-col gap-1.5 text-left">
                  <span class="text-12-medium text-text-weak">{language.t("home.createProject.nameLabel")}</span>
                  <input
                    ref={(el) => {
                      input = el
                      queueMicrotask(() => el.focus())
                    }}
                    class="h-9 rounded-md border border-border-subtle bg-surface-base px-3 text-13-regular text-text-strong outline-none placeholder:text-text-disabled focus:border-border-strong"
                    type="text"
                    value={name()}
                    onInput={(event) => setName(event.currentTarget.value)}
                    placeholder={language.t("home.createProject.namePlaceholder")}
                  />
                </label>
                <div class="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="large"
                    onClick={() => {
                      resolve(undefined)
                      dialog.close()
                    }}
                  >
                    {language.t("common.cancel")}
                  </Button>
                  <Button type="button" variant="primary" size="large" onClick={finish}>
                    {language.t("home.createProject.create")}
                  </Button>
                </div>
              </form>
            </Dialog>
          )
        },
        () => resolve(undefined),
      )
    })
  }

  async function createProject() {
    const requestedName = await askProjectName()
    if (requestedName === undefined) return
    const storage = platform.storage?.(workspaceStorage)
    const base = (await storage?.getItem(workspaceRootKey)) || (await chooseProjectRoot())
    if (!base) return
    if (!platform.createProjectFolder) {
      void openProject(base)
      return
    }
    const directory = await platform.createProjectFolder(base, requestedName || undefined).catch(async (error: unknown) => {
      if (error instanceof Error && error.message.includes("PROJECT_NAME_EXISTS")) {
        showToast({
          title: language.t("home.createProject.exists.title"),
          description: language.t("home.createProject.exists.description"),
        })
        return
      }
      await storage?.removeItem(workspaceRootKey)
      setProjectRoot(undefined)
      const nextBase = await chooseProjectRoot()
      if (!nextBase) return
      return platform.createProjectFolder?.(nextBase, requestedName || undefined)
    })
    if (!directory) {
      showToast({
        title: language.t("home.createProject.failed.title"),
        description: language.t("home.createProject.failed.description"),
      })
      return
    }
    void loadProjectLibrary()
    void openProject(directory)
  }

  async function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          void openProject(directory)
        }
      } else if (result) {
        void openProject(result)
      }
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
    } else {
      dialog.show(
        () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
        () => resolve(null),
      )
    }
  }

  async function continueProject() {
    const resolve = (result: string | string[] | null) => {
      const directory = Array.isArray(result) ? result[0] : result
      if (!directory) return
      void openProject(directory)
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      resolve(
        await platform.openDirectoryPickerDialog({
          title: language.t("home.continue.title"),
          multiple: false,
        }),
      )
      return
    }

    dialog.show(
      () => (
        <DialogSelectDirectory
          title={language.t("home.continue.title")}
          multiple={false}
          onSelect={(result) => {
            dialog.close()
            resolve(result)
          }}
        />
      ),
      () => resolve(null),
    )
  }

  function ShowProjects(props: { title: string; projects: RecentProject[]; compact?: boolean }) {
    return (
      <Show when={props.projects.length > 0}>
        <div class="flex w-full flex-col gap-2">
          <div class="flex gap-2 items-center justify-between pl-3">
            <div class="text-14-medium text-text-strong">{props.title}</div>
          </div>
          <ul class={`flex flex-col gap-1.5 ${props.compact ? "max-h-56 overflow-y-auto pr-1" : ""}`}>
            <For each={props.projects}>
              {(project) => (
                <Button
                  size="large"
                  variant="ghost"
                  class="min-w-0 text-13-mono text-left justify-between px-3"
                  onClick={() => void openProject(project.worktree)}
                >
                  <span class="min-w-0 truncate">{project.worktree.replace(homedir(), "~")}</span>
                  <div class="shrink-0 text-13-regular text-text-weak">{formatRelative(project.at)}</div>
                </Button>
              )}
            </For>
          </ul>
        </div>
      </Show>
    )
  }

  return (
    <div class="mx-auto mt-48 w-full max-w-[720px] px-4">
      <ProjectDrawer
        open={drawerOpen()}
        onClose={() => setDrawerOpen(false)}
        projects={allProjects()}
        homedir={homedir()}
        formatRelative={formatRelative}
        onOpenProject={(worktree) => void openProject(worktree)}
        onNewProject={() => void createProject()}
      />
      <div class="mx-auto flex w-full flex-col items-center gap-3 text-center">
        <div class="flex items-center gap-2">
          <div class="flex size-7 items-center justify-center rounded-[7px] bg-[#f7f7f7] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            <svg viewBox="0 0 24 24" class="size-5 text-[#101318]" fill="none" aria-hidden="true">
              <path
                d="M18.6 6.1A8.4 8.4 0 0 0 5.2 16.2M5.4 17.9a8.4 8.4 0 0 0 13.4-10.1"
                stroke="currentColor"
                stroke-width="4"
                stroke-linecap="butt"
              />
            </svg>
          </div>
          <div class="text-16-medium text-text-strong">OCode</div>
        </div>
        <div class="text-12-regular text-text-weak">Code Without Limits</div>
      </div>
      <div class="mt-7 flex items-center justify-center gap-2">
        <Button icon="folder-add-left" size="normal" class="pl-2 pr-3" onClick={() => void createProject()}>
          {language.t("home.createProject")}
        </Button>
        <Button
          size="normal"
          variant="secondary"
          class="px-3"
          onClick={() => void continueProject()}
        >
          {language.t("common.continue")}
        </Button>
      </div>
      <Switch>
        <Match when={recent().length > 0 || projectLibrary().length > 0}>
          <div class="mt-16 w-full flex flex-col gap-3">
            <ShowProjects title={language.t("home.recentProjects")} projects={allProjects().slice(0, 6)} />
          </div>
        </Match>
        <Match when={true}>
          <div class="mt-20 mx-auto flex flex-col items-center gap-3">
            <Icon name="folder-add-left" size="small" class="text-icon-weak" />
            <div class="flex flex-col gap-1 items-center justify-center">
              <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
              <div class="text-12-regular text-text-weak">
                {language.t("home.empty.description")}
              </div>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  )
}

function isNoisyProject(project: { name?: string; worktree: string }) {
  const worktree = project.worktree.trim().replaceAll("\\", "/")
  if (!worktree || worktree === "/") return true

  const value = `${project.name ?? ""}\n${worktree}`.toLowerCase()
  return [
    "/opencode projects/",
    "/opencode-test",
    "/tmp/demo",
    "/temp/demo",
    "/demo-project",
    "/sample-project",
    "/test-project",
    "/project-",
    "opencode-onboarding-",
  ].some((pattern) => value.includes(pattern))
}

function parseProjectMemory(raw: string | null) {
  if (!raw) return
  try {
    return JSON.parse(raw) as { stack?: unknown }
  } catch {
    return
  }
}

function parseRecentProjects(raw: string | null) {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const project = item as { worktree?: unknown; at?: unknown }
      if (typeof project.worktree !== "string") return []
      return [{ worktree: project.worktree, at: typeof project.at === "number" ? project.at : 0 }]
    })
  } catch {
    return []
  }
}
