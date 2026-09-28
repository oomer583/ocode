import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const SETTINGS_STORE = "opencode.settings"
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl"
export const WSL_ENABLED_KEY = "wslEnabled"
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"

export const OCODE_COMMUNITY_URL = "https://discord.gg/QuV6chaxUq"

export function isAllowedExternalUrl(url: string) {
  return URL.canParse(url) && new URL(url).protocol === "https:" && new URL(url).hostname === "discord.gg"
}
