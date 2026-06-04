# Forge

[中文](README.md) | [English](README.en.md)

Forge is an open-source local AI coding agent desktop app. It is built for real project workflows. It is not a VS Code fork and not an editor plugin marketplace. Users can open a local project, configure their own models and providers, ask the agent to generate plans, review file changes, run verification commands, and perform Git operations after explicit confirmation.

Forge aims to move AI coding from "suggestions in a chat box" to a local engineering workflow that is reviewable, recoverable, and verifiable.

## Features

### Local Project Workbench

- Open a local project directory and build a project file index.
- Browse the file tree and preview text, code, Markdown, images, PDFs, audio, and video.
- The project file tree shows non-sensitive files even when ordinary files are ignored by `.gitignore`.
- Agent directory listing, text search, and glob tools still respect `.gitignore` to keep automated search scoped and responsive on large projects.
- Sensitive paths such as `.env`, private keys, certificates, credential folders, and database files are excluded from agent file tools and previews by default.
- File browsing uses lazy directory loading and paged large directories to avoid rendering a whole large repository at once.
- Project scan metadata and text-search snapshots are cached in the local app data directory for later reuse.
- AI-generated file changes enter a review queue and are written to disk only after user confirmation.

### Agent Task Threads

- Each task is organized as a thread with the user request, model plan, execution log, file events, and command results.
- Plans are parsed into actions such as file reads, directory listing, glob, text search, file edits, command execution, Git checks, and manual gates.
- Agent profiles control system prompts, context budgets, planning limits, automatic run limits, verification behavior, recovery behavior, recovery limits, and tool permissions.
- The confirmation queue collects pending diffs, command approvals, manual gates, commit gates, and recovery steps.
- Stop pauses the queue without skipping diff review, command approval, or commit gates.
- Failure recovery can generate follow-up plans from real tool results and command output, while dependency installation, external permissions, high-risk deletion, and production deployment still require user intervention.
- Normal Q&A, explanation, memory, and chat requests are not forced into the project-change workflow.

### Composer, Attachments, And Context References

- The composer supports attachments through the add menu, drag-and-drop, and paste.
- Supported inputs include images, PDFs, DOCX, XLSX, CSV, TSV, Markdown, JSON, code files, and common text files.
- Images and scanned PDFs can be processed with local OCR in a worker so the main UI stays responsive.
- DOCX, XLSX, CSV, and TSV files are parsed locally into bounded text summaries.
- Sensitive attachments are skipped by default to avoid adding secrets or local data to model context.
- Typing `/` opens Forge commands and skill candidates. Commands run UI operations instead of being sent as normal chat text.
- Typing `@` searches files, plugins, and skills.
- Files, plugins, and skills added through the menu or candidate list are sent as context for the current task.

### Plugins And Skills

- The sidebar includes a plugin directory. A plugin organizes a group of reusable skills.
- Forge scans common local skill locations, including `~/.codex/skills`, `~/.agents/skills`, and `SKILL.md` files inside the Codex plugin cache.
- The plugin page can switch between plugin and skill lists.
- Plugin details show bundled skills.
- Skill details show source, local path, core files, and read-only `SKILL.md` content.
- The GitHub extension entry can open repositories in `https://github.com/owner/repo` or `owner/repo` format.
- The current version does not automatically clone, install, or execute third-party plugin code.

### Models And Providers

Forge includes provider presets for OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Kimi, DashScope, Z.AI, MiniMax, SiliconFlow, Volcengine, Qianfan, Hunyuan, Groq, Together AI, Mistral AI, xAI, Fireworks AI, Cerebras, StepFun, ModelScope, Xiaomi MiMo, GitHub Models / Copilot, and Ollama.

Users can also add custom OpenAI-compatible API providers with their own base URL, API key, model list, and pricing.

The model picker supports:

- Fetching remote model lists.
- Manually adding model IDs.
- Searching by provider, model ID, and model name.
- Enabling or disabling models.
- Displaying context window, tool calling, streaming, vision, reasoning, pricing, and pricing-source metadata.
- Filtering obvious non-coding models such as speech, image, embedding, and moderation models.

### Commands, Git, And Verification

- Run controlled commands inside the current project directory.
- Stream command output into the task thread.
- Cancel running commands.
- Use command safety rules and manual approval.
- Choose between read-only, review, and full-access permission modes.
- View Git status and diff summaries.
- Create Git commits after entering a commit message.
- Push explicitly or choose push during commit. Forge does not push without confirmation.
- Create persistent Git worktrees from the project menu and add them to recent projects.

### Personalization, Memory, And Usage

- Built-in development, review, and documentation agent profiles.
- Project-scoped agent memory.
- Response style, custom instructions, background image, and UI language settings.
- Local token usage records and cost estimates.
- Cost estimates are based on local records, cache tokens, and user-configured prices. They do not replace final provider billing.

## Tech Stack

- Electron / electron-vite
- React
- TypeScript
- Tailwind CSS
- Radix UI
- Lucide React
- Shiki
- Tesseract.js
- PDF.js
- Mammoth
- read-excel-file
- Prettier
- ESLint

## Requirements

- Windows 11 is the primary development and verification target.
- Node.js and npm.
- Ollama must be installed and running if you want to use Ollama.
- Remote model providers require the corresponding API key or OpenAI-compatible gateway configuration.

## Install Dependencies

```powershell
npm install
```

## Local Development

```powershell
npm run dev
```

## Build

```powershell
npm run build
```

## Build The Windows Installer

```powershell
npm run dist:win
```

The installer is written to the `release` directory. The current Windows installer is not code-signed, so Windows may show a security warning on first install.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

For release checks:

```powershell
npm run release:check
```

The project currently does not include a separate `npm test` script.

## Environment Variables

Local development does not require a project-level `.env` file. API keys are saved through the app settings and handled by secure storage on the Electron main-process side.

Do not write API keys, tokens, cookies, private keys, or certificates into README files, commit messages, or logs.

## Project Structure

```text
src/
  main/        Electron main process: IPC, keys, model requests, Git, commands, and file services
  preload/     Safe window.forge APIs exposed to the renderer
  renderer/    React desktop UI, state management, components, and i18n
  shared/      Shared types, provider adapters, and request logic
docs/
  AGENT_RUNTIME.md   Agent Runtime productization roadmap
  PERFORMANCE.md     Performance strategy and large-project roadmap
  RELEASE.md         Windows installer release workflow
```

## Basic Workflow

1. Start Forge.
2. Open settings and choose UI language, preferences, and an agent profile.
3. Configure provider API keys, base URLs, and models.
4. Select a local project directory.
5. Add attachment, file, plugin, or skill context through the add menu, `/`, or `@` when needed.
6. Enter a task and choose a model.
7. Review the agent plan and action queue.
8. Review AI-generated file diffs.
9. Run verification commands when needed.
10. Review Git status, enter a commit message, and create a commit.
11. Push explicitly if needed.

## Safety Boundaries

- File changes require user confirmation.
- Command execution is constrained by project directory, permission mode, and command rules.
- Read-only mode does not generate edits, run commands, or perform Git operations.
- Sensitive files and sensitive attachments are skipped by default.
- Git commit and push require explicit user action.
- The current version does not automatically install or execute third-party GitHub plugin code.
- Forge does not automatically publish, deploy, or delete files outside the project.

## FAQ

### Does Forge upload my whole project?

No. Forge reads the files needed for tasks initiated by the user and builds model context from them. Sensitive files are excluded by default.

### Does Forge execute downloaded plugins automatically?

No. The current GitHub extension entry only opens repositories for manual inspection or download. Forge does not automatically clone, install, or execute third-party repository code.

### Does Forge push code automatically?

No. Forge does not push without confirmation. Users can explicitly push from source control or choose push during commit.

### Does local development require `.env`?

No. API keys are saved in the app settings.

### Why do some files not have syntax highlighting?

Forge uses Shiki highlighting for common engineering languages. Less common languages remain previewable as plain text to reduce app bundle size and async loading chunks.

## Status

Forge is currently in the 0.1.x stage. The core workflow is usable, including local project indexing, provider configuration, agent planning, file review, command execution, Git operations, plugin and skill context, agent profiles, memory, usage tracking, and localized error messages.

Ongoing work includes:

- A more complete Runtime state-machine split.
- More granular permission policies.
- A stronger automatic verification and failure-recovery loop.
- Better large-project incremental scanning, text indexing, and large-file preview.
- A more stable product-grade packaging and release workflow.

## License

MIT
