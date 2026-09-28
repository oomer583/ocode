export const TERMINAL_RUN_COMMAND_EVENT = "ocode-terminal-run-command"

export type TerminalRunCommandDetail = {
  id: string
  command: string
}

export function dispatchTerminalCommand(detail: TerminalRunCommandDetail) {
  document.dispatchEvent(new CustomEvent<TerminalRunCommandDetail>(TERMINAL_RUN_COMMAND_EVENT, { detail }))
}
