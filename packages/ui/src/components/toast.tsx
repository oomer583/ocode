import { Toast as Kobalte, toaster } from "@kobalte/core/toast"
import type { ToastRootProps, ToastCloseButtonProps, ToastTitleProps, ToastDescriptionProps } from "@kobalte/core/toast"
import type { ComponentProps, JSX } from "solid-js"
import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useI18n } from "../context/i18n"
import { Icon, type IconProps } from "./icon"
import { IconButton } from "./icon-button"

export interface ToastRegionProps extends ComponentProps<typeof Kobalte.Region> {}

function ToastRegion(props: ToastRegionProps) {
  return (
    <Portal>
      <Kobalte.Region data-component="toast-region" {...props}>
        <Kobalte.List data-slot="toast-list" />
      </Kobalte.Region>
    </Portal>
  )
}

export interface ToastRootComponentProps extends ToastRootProps {
  class?: string
  classList?: ComponentProps<"li">["classList"]
  children?: JSX.Element
}

function ToastRoot(props: ToastRootComponentProps) {
  return (
    <Kobalte
      data-component="toast"
      classList={{
        ...props.classList,
        [props.class ?? ""]: !!props.class,
      }}
      {...props}
    />
  )
}

function ToastIcon(props: { name: IconProps["name"] }) {
  return (
    <div data-slot="toast-icon">
      <Icon name={props.name} />
    </div>
  )
}

function ToastContent(props: ComponentProps<"div">) {
  return <div data-slot="toast-content" {...props} />
}

function ToastTitle(props: ToastTitleProps & ComponentProps<"div">) {
  return <Kobalte.Title data-slot="toast-title" {...props} />
}

function ToastDescription(props: ToastDescriptionProps & ComponentProps<"div">) {
  return <Kobalte.Description data-slot="toast-description" {...props} />
}

function ToastActions(props: ComponentProps<"div">) {
  return <div data-slot="toast-actions" {...props} />
}

function ToastCloseButton(props: ToastCloseButtonProps & ComponentProps<"button">) {
  const i18n = useI18n()
  return (
    <Kobalte.CloseButton
      data-slot="toast-close-button"
      as={IconButton}
      icon="close"
      variant="ghost"
      aria-label={i18n.t("ui.common.dismiss")}
      {...props}
    />
  )
}

function ToastProgressTrack(props: ComponentProps<typeof Kobalte.ProgressTrack>) {
  return <Kobalte.ProgressTrack data-slot="toast-progress-track" {...props} />
}

function ToastProgressFill(props: ComponentProps<typeof Kobalte.ProgressFill>) {
  return <Kobalte.ProgressFill data-slot="toast-progress-fill" {...props} />
}

export const Toast = Object.assign(ToastRoot, {
  Region: ToastRegion,
  Icon: ToastIcon,
  Content: ToastContent,
  Title: ToastTitle,
  Description: ToastDescription,
  Actions: ToastActions,
  CloseButton: ToastCloseButton,
  ProgressTrack: ToastProgressTrack,
  ProgressFill: ToastProgressFill,
})

export { toaster }

export type ToastVariant = "default" | "success" | "error" | "loading"

export interface ToastAction {
  label: string
  onClick: "dismiss" | (() => void)
}

export interface ToastOptions {
  title?: string
  description?: string
  icon?: IconProps["name"]
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
  actions?: ToastAction[]
}

function toastCopyText(options: ToastOptions) {
  return [options.title, options.description].filter(Boolean).join("\n")
}

function errorCopyText(error: unknown) {
  if (error instanceof Error) return [error.name, error.message, error.stack].filter(Boolean).join("\n")
  if (typeof error === "string") return error
  return ""
}

function writeClipboard(text: string) {
  if (typeof navigator === "undefined") return
  void navigator.clipboard?.writeText(text)
}

function ToastActionButton(props: { action: ToastAction; toastId: number }) {
  return (
    <button
      data-slot="toast-action"
      onClick={() => {
        if (typeof props.action.onClick === "function") {
          props.action.onClick()
        }
        toaster.dismiss(props.toastId)
      }}
    >
      {props.action.label}
    </button>
  )
}

function ToastView(props: { opts: ToastOptions; toastId: number }) {
  const i18n = useI18n()
  const actions = () => {
    const copyText = toastCopyText(props.opts)
    if ((!props.opts.title && props.opts.variant !== "error") || props.opts.variant === "success" || !copyText) {
      return props.opts.actions ?? []
    }
    if (props.opts.actions?.some((action) => action.label === i18n.t("ui.toast.copyToClipboard"))) {
      return props.opts.actions
    }
    return [
      {
        label: i18n.t("ui.toast.copyToClipboard"),
        onClick: () => writeClipboard(copyText),
      },
      ...(props.opts.actions ?? []),
    ]
  }
  return (
    <Toast
      toastId={props.toastId}
      duration={props.opts.duration}
      persistent={props.opts.persistent}
      data-variant={props.opts.variant ?? "default"}
    >
      <Show when={props.opts.icon}>
        <Toast.Icon name={props.opts.icon!} />
      </Show>
      <Toast.Content>
        <Show when={props.opts.title}>
          <Toast.Title>{props.opts.title}</Toast.Title>
        </Show>
        <Show when={props.opts.description}>
          <Toast.Description>{props.opts.description}</Toast.Description>
        </Show>
        <Show when={actions().length}>
          <Toast.Actions>
            {actions().map((action) => (
              <ToastActionButton action={action} toastId={props.toastId} />
            ))}
          </Toast.Actions>
        </Show>
      </Toast.Content>
      <Toast.CloseButton />
    </Toast>
  )
}

export function showToast(options: ToastOptions | string) {
  const opts = typeof options === "string" ? { description: options } : options
  return toaster.show((props) => <ToastView opts={opts} toastId={props.toastId} />)
}

export interface ToastPromiseOptions<T, U = unknown> {
  loading?: JSX.Element
  success?: (data: T) => JSX.Element
  error?: (error: U) => JSX.Element
}

export function showPromiseToast<T, U = unknown>(
  promise: Promise<T> | (() => Promise<T>),
  options: ToastPromiseOptions<T, U>,
) {
  return toaster.promise(promise, (props) => {
    const i18n = useI18n()
    const copyText = () => (props.state === "rejected" ? errorCopyText(props.error) : "")
    return (
      <Toast
        toastId={props.toastId}
        data-variant={props.state === "pending" ? "loading" : props.state === "fulfilled" ? "success" : "error"}
      >
        <Toast.Content>
          <Toast.Description>
            {props.state === "pending" && options.loading}
            {props.state === "fulfilled" && options.success?.(props.data!)}
            {props.state === "rejected" && options.error?.(props.error)}
          </Toast.Description>
          <Show when={copyText()}>
            <Toast.Actions>
              <ToastActionButton
                action={{
                  label: i18n.t("ui.toast.copyToClipboard"),
                  onClick: () => writeClipboard(copyText()),
                }}
                toastId={props.toastId}
              />
            </Toast.Actions>
          </Show>
        </Toast.Content>
        <Toast.CloseButton />
      </Toast>
    )
  })
}
