# Extensions System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Forge's v0.2.x Extensions system as real external-service capabilities, starting with QQ Mail.

**Architecture:** Extensions are registered in the Electron main process, exposed through typed IPC, controlled by a manifest and permission model, and audited with local invocation logs. The renderer owns enable/disable UI, credential entry, confirmation gates, and Agent queue integration, while secrets and external network actions stay in the main process.

**Tech Stack:** Electron, React, TypeScript, localStorage for non-secret preferences, Electron safeStorage-backed vault for secrets, imapflow, mailparser, nodemailer.

---

### Task 1: Shared Extension Contracts

**Files:**
- Create: `src/shared/extensionTypes.ts`
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/shared/agentExecutionPlan.ts`

- [x] Define manifest, permission, action, settings, secret status, invocation request/result, confirmation, and log record types.
- [x] Add `extensionChannels` for registry, settings, secrets, invoke, confirm, and logs.
- [x] Add `invoke-extension` to `AgentAction`, with `extensionId`, `actionId`, `input`, `risk`, and `requiresConfirmation`.

### Task 2: Main Process Extension Runtime

**Files:**
- Create: `src/main/extensions/extensionRegistry.ts`
- Create: `src/main/extensions/extensionStore.ts`
- Create: `src/main/extensions/extensionInvocationLog.ts`
- Create: `src/main/extensions/qqMailExtension.ts`
- Create: `src/main/extensionIpc.ts`
- Modify: `src/main/keyVault.ts`
- Modify: `src/main/keyVaultIpc.ts`
- Modify: `src/main/index.ts`

- [x] Register built-in QQ Mail manifest and action handlers.
- [x] Persist extension enabled state and per-permission modes outside the secret file.
- [x] Store extension credentials in the existing encrypted vault, separate from provider API keys.
- [x] Record every extension invocation with sanitized input and output summaries.
- [x] Implement QQ Mail IMAP actions: `listInbox`, `readEmail`, `searchEmails`.
- [x] Implement QQ Mail draft and send actions: `createDraft`, `sendEmail`.
- [x] Enforce `sendEmail` confirmation server-side even if the renderer or Agent tries to skip it.

### Task 3: Renderer Extension State And Page

**Files:**
- Create: `src/renderer/src/state/extensions.ts`
- Create: `src/renderer/src/components/ExtensionsPanel.tsx`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/vite-env.d.ts`
- Modify: `src/renderer/src/components/AppShell.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/i18n/messages.ts`

- [x] Expose `window.forge.extensions` typed APIs through preload.
- [x] Add a Sidebar Extensions page distinct from the existing plugin/skill catalog.
- [x] Show registry, enable/disable controls, permission modes, connection status, credential entry, action list, and invocation log.
- [x] Provide manual QQ Mail action controls for listing, reading, searching, drafting, and sending test messages.
- [x] Require an explicit confirmation modal/card for high-risk sends.

### Task 4: Agent Runtime Integration

**Files:**
- Modify: `src/main/agentPlanService.ts`
- Modify: `src/renderer/src/agent/agentActionExecutor.ts`
- Modify: `src/renderer/src/agent/agentRuntimeOrchestrator.ts`
- Modify: `src/renderer/src/agent/agentConfirmationQueue.ts`
- Modify: `src/renderer/src/components/AgentConfirmationQueue.tsx`
- Modify: `src/renderer/src/state/taskThreads.ts`
- Modify: `src/renderer/src/agent/agentToolResults.ts`
- Modify: `src/renderer/src/agent/agentRequestPayloads.ts`

- [x] Include enabled extension action schemas in Agent planning context.
- [x] Parse structured plan steps that request `invoke_extension` or compatible action fields.
- [x] Route extension actions through Runtime preflight and permission checks.
- [x] Add confirmation queue support for external actions, especially `sendEmail`.
- [x] Append extension invocation events and sanitized results to task threads.
- [x] Make extension results available as recent tool evidence for follow-up file changes.

### Task 5: Documentation And Verification

**Files:**
- Create: `docs/EXTENSIONS.md`
- Modify: `README.md`
- Modify: `README.en.md`

- [x] Document Skill vs Extension, registry, permissions, logs, confirmation, QQ Mail setup, and limitations.
- [x] Keep README changes limited to shipped behavior.
- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Do not change `package.json` version.
- [x] Do not create GitHub Release.
- [x] Push only after explicit user request.
