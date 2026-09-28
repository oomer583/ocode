import { MetaProvider } from "@solidjs/meta"
import { render } from "solid-js/web"
import "@opencode-ai/app/index.css"
import { Font } from "@opencode-ai/ui/font"
import "./styles.css"
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { InitStep, SqliteMigrationProgress } from "../preload/types"

const root = document.getElementById("root")!
const lines = ["Code Without Limits", "Preparing workspace", "Finishing setup"]
const delays = [3000, 9000]

render(() => {
  const [step, setStep] = createSignal<InitStep | null>(null)
  const [line, setLine] = createSignal(0)
  const [percent, setPercent] = createSignal(0)

  const phase = createMemo(() => step()?.phase)

  const value = createMemo(() => {
    if (phase() === "done") return 100
    return Math.max(25, Math.min(100, percent()))
  })

  window.api.awaitInitialization((next) => setStep(next as InitStep)).catch(() => undefined)

  onMount(() => {
    setLine(0)
    setPercent(0)

    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))

    const listener = window.api.onSqliteMigrationProgress((progress: SqliteMigrationProgress) => {
      if (progress.type === "InProgress") setPercent(Math.max(0, Math.min(100, progress.value)))
      if (progress.type === "Done") {
        setPercent(100)
        setStep({ phase: "done" })
      }
    })

    onCleanup(() => {
      listener()
      timers.forEach(clearTimeout)
    })
  })

  createEffect(() => {
    if (phase() !== "done") return

    const timer = setTimeout(() => window.api.loadingWindowComplete(), 180)
    onCleanup(() => clearTimeout(timer))
  })

  const status = createMemo(() => {
    if (phase() === "done") return "Ready"
    if (phase() === "sqlite_waiting") return lines[line()]
    return "Code Without Limits"
  })

  return (
    <MetaProvider>
      <div class="w-screen h-screen bg-[#101010] flex items-center justify-center">
        <Font />
        <div class="flex flex-col items-center gap-5">
          <div class="ocode-loader-shell" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="ocode-loader-mark" fill="none">
              <path
                d="M18.6 6.1A8.4 8.4 0 0 0 5.2 16.2M5.4 17.9a8.4 8.4 0 0 0 13.4-10.1"
                stroke="currentColor"
                stroke-width="4"
                stroke-linecap="butt"
              />
            </svg>
          </div>
          <div class="w-60 flex flex-col items-center gap-1.5" aria-live="polite">
            <div class="flex flex-col items-center gap-1">
              <span class="text-15-medium text-text-strong">OCode</span>
            </div>
            <span class="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-weak text-12-regular">
              {status()}
            </span>
          </div>
        </div>
      </div>
    </MetaProvider>
  )
}, root)
