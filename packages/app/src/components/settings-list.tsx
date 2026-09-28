import { type Component, type JSX } from "solid-js"

export const SettingsList: Component<{ children: JSX.Element }> = (props) => {
  return <div class="bg-background-base px-2 rounded-[6px] border border-border-weaker-base">{props.children}</div>
}
