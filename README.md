<div align="center">

<img src="assets/ocode-logo.svg" alt="OCode" width="88" height="88" />

# OCode

**Code Without Limits**

A desktop coding agent that runs on your own model key.

</div>

---

## What it is

OCode opens a project folder and puts an agent inside it. You describe what you want; it reads, writes and runs code in that folder. It is a desktop application built on top of [opencode](https://github.com/sst/opencode) (MIT), with its own shell, interface and project workflow.

## Why it exists

Most coding agents resell model access and bill you per token. OCode does not sell model access. You connect your own provider key and pay the provider directly, or pay nothing at all if you use a free model.

## What is in it

**Bring your own key.** OpenRouter, OpenAI, Anthropic and the other providers opencode supports. Keys stay on your machine.

**Honest model labels.** A model is tagged `Free` only when it really is free. Everything else is tagged `Paid API`. Providers are shown as `via <provider>`, because OCode does not put its own name on somebody else's model.

**OCode Free.** A zero-cost starting point that routes to the free model pool on OpenRouter, including models that understand images and call tools.

**Focus mode.** The default interface. No rail, no clutter, just the project and the conversation.

**Project drawer.** Every project you have, one click away from the title bar. The home screen keeps only the six most recent.

**Project library.** Point OCode at a folder and it manages your projects inside it, each with its own `ocode.rules.md`.

## Status

Early, and honest about it. The source in this repository was recovered from a compiled build after the original working copy was lost, and development continues from there. Expect rough edges.

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun dev:desktop
```

Packaging:

```bash
bun --cwd packages/desktop package:win
bun --cwd packages/desktop package:mac
bun --cwd packages/desktop package:linux
```

Type checking the whole monorepo:

```bash
bun typecheck
```

## Credits

OCode is a fork of [opencode](https://github.com/sst/opencode), used under the MIT License. The upstream license is kept in [LICENSE](LICENSE).

## License

MIT