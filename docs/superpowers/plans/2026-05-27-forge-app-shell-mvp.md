# Forge App Shell MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Forge 0.1 as a runnable Electron desktop app with a Chinese-first shell, local model settings, and a Codex-style model selector.

**Architecture:** Use `electron-vite` with separate main, preload, and renderer processes. Keep model/provider data in shared TypeScript modules, persist user settings in renderer localStorage for 0.1, and route all UI through a small Chinese/English i18n layer. This plan deliberately creates the app shell and model-selection vertical slice before Agent Runtime, terminal execution, and Diff Review.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Tailwind CSS v4, Radix Dropdown Menu, lucide-react, Vitest, Testing Library.

---

## Verified Docs

- Electron app structure and process split: https://www.electronjs.org/docs/latest/tutorial/quick-start
- electron-vite project structure and commands: https://electron-vite.org/guide/
- Tailwind CSS v4 with Vite plugin: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui Vite guidance for React aliases and Tailwind setup: https://ui.shadcn.com/docs/installation/vite

## Scope

This plan implements the first vertical slice:

- Desktop app boots through Electron
- Renderer shows Forge product shell
- Default language is Chinese
- English language resources exist and can be switched in state
- Settings data model supports provider catalog, enabled models, intelligence level, and speed mode
- Task input area shows the Codex-style model selector
- Unit tests cover model filtering, language defaults, and selector behavior

This plan does not implement:

- Real API key storage
- Real provider network calls
- Agent Runtime
- terminal execution
- Diff Review
- Git commit actions
- voice input

## File Structure

Create these files:

- `package.json` - npm scripts and dependency manifest
- `electron.vite.config.ts` - electron-vite config for main, preload, and renderer
- `tsconfig.json` - project references
- `tsconfig.node.json` - TypeScript config for Electron main/preload/config files
- `tsconfig.web.json` - TypeScript config for React renderer and tests
- `index.html` - renderer HTML entry
- `src/main/index.ts` - Electron main process window creation
- `src/preload/index.ts` - safe preload bridge placeholder
- `src/shared/modelTypes.ts` - provider, model, intelligence, and speed types
- `src/shared/providerCatalog.ts` - built-in provider catalog metadata
- `src/renderer/src/main.tsx` - React entry
- `src/renderer/src/App.tsx` - top-level app composition
- `src/renderer/src/index.css` - Tailwind and app theme
- `src/renderer/src/vite-env.d.ts` - Vite type references
- `src/renderer/src/i18n/messages.ts` - Chinese and English UI strings
- `src/renderer/src/i18n/useI18n.ts` - small translation hook
- `src/renderer/src/state/modelSettings.ts` - local model settings store helpers
- `src/renderer/src/components/AppShell.tsx` - Forge layout
- `src/renderer/src/components/ModelSelector.tsx` - Codex-style model selector
- `src/renderer/src/components/SettingsPanel.tsx` - local provider/model settings panel
- `src/renderer/src/components/TaskComposer.tsx` - task input area
- `src/renderer/src/test/setup.ts` - Testing Library setup
- `src/renderer/src/state/modelSettings.test.ts` - model settings tests
- `src/renderer/src/i18n/messages.test.ts` - i18n tests
- `src/renderer/src/components/ModelSelector.test.tsx` - selector behavior tests

Modify no existing application source files because the repository currently only contains docs.

---

### Task 1: Create Electron React Toolchain

**Files:**

- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `index.html`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/index.css`
- Create: `src/renderer/src/vite-env.d.ts`

- [ ] **Step 1: Create the package manifest**

Create `package.json`:

```json
{
  "name": "forge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "test": "vitest --run",
    "test:watch": "vitest",
    "lint": "eslint ."
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 2: Install runtime dependencies**

Run:

```powershell
npm install react react-dom @tailwindcss/vite tailwindcss lucide-react clsx tailwind-merge class-variance-authority @radix-ui/react-dropdown-menu
```

Expected: `package-lock.json` is created and runtime dependencies are added to `package.json`.

- [ ] **Step 3: Install development dependencies**

Run:

```powershell
npm install -D electron electron-vite vite typescript vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react @types/node @types/react @types/react-dom eslint @eslint/js typescript-eslint
```

Expected: dev dependencies are added to `package.json`.

- [ ] **Step 4: Add electron-vite config**

Create `electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@shared": resolve("src/shared")
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
```

- [ ] **Step 5: Add TypeScript configs**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": [
    "electron.vite.config.ts",
    "src/main/**/*.ts",
    "src/preload/**/*.ts",
    "src/shared/**/*.ts"
  ]
}
```

Create `tsconfig.web.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": [
    "src/renderer/src/**/*.ts",
    "src/renderer/src/**/*.tsx",
    "src/shared/**/*.ts"
  ]
}
```

- [ ] **Step 6: Add Electron main and preload entries**

Create `src/main/index.ts`:

```ts
import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Forge",
    backgroundColor: "#101114",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

Create `src/preload/index.ts`:

```ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("forge", {
  appName: "Forge"
});
```

- [ ] **Step 7: Add renderer entry**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Forge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/src/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/renderer/src/App.tsx`:

```tsx
export function App(): JSX.Element {
  return (
    <main className="min-h-screen bg-[#101114] text-[#f5f4ef]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <div>
          <p className="text-sm text-[#a8a29a]">Forge</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">本地 AI 开发锻造台</h1>
        </div>
      </div>
    </main>
  );
}
```

Create `src/renderer/src/index.css`:

```css
@import "tailwindcss";

:root {
  font-family:
    Inter, "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  color: #f5f4ef;
  background: #101114;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
textarea,
select {
  font: inherit;
}
```

Create `src/renderer/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface Window {
  forge: {
    appName: string;
  };
}
```

- [ ] **Step 8: Run toolchain checks**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit with code `0`.

- [ ] **Step 9: Commit the scaffold**

Run:

```powershell
git add -- package.json package-lock.json electron.vite.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json index.html src
git commit -m "搭建 Forge 桌面应用骨架"
```

Expected: commit succeeds.

---

### Task 2: Add Model Domain and Local Settings Store

**Files:**

- Create: `src/shared/modelTypes.ts`
- Create: `src/shared/providerCatalog.ts`
- Create: `src/renderer/src/state/modelSettings.ts`
- Create: `src/renderer/src/state/modelSettings.test.ts`

- [ ] **Step 1: Write model settings tests first**

Create `src/renderer/src/state/modelSettings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createDefaultModelSettings,
  getEnabledModels,
  setCurrentModel,
  updateModelEnabled
} from "./modelSettings";

describe("modelSettings", () => {
  it("starts with Chinese defaults and no enabled models", () => {
    const settings = createDefaultModelSettings();

    expect(settings.language).toBe("zh-CN");
    expect(settings.intelligence).toBe("high");
    expect(settings.speed).toBe("balanced");
    expect(getEnabledModels(settings)).toEqual([]);
  });

  it("only returns models explicitly enabled by the user", () => {
    let settings = createDefaultModelSettings();

    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = updateModelEnabled(settings, "anthropic:claude-sonnet", false);

    expect(getEnabledModels(settings).map((model) => model.id)).toEqual(["openai:gpt-5.5"]);
  });

  it("keeps the current model pointed at an enabled model", () => {
    let settings = createDefaultModelSettings();

    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    expect(settings.currentModelId).toBe("openai:gpt-5.5");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm run test -- src/renderer/src/state/modelSettings.test.ts
```

Expected: FAIL because `modelSettings.ts` does not exist.

- [ ] **Step 3: Add shared model types**

Create `src/shared/modelTypes.ts`:

```ts
export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai-compatible";

export type Language = "zh-CN" | "en-US";

export type IntelligenceLevel = "low" | "medium" | "high" | "xhigh";

export type SpeedMode = "fast" | "balanced" | "careful";

export type ReasoningControl =
  | { type: "none" }
  | { type: "effort"; values: IntelligenceLevel[] }
  | { type: "budget"; min: number; max: number };

export type ForgeProvider = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  requiresBaseUrl: boolean;
};

export type ForgeModel = {
  id: string;
  providerId: string;
  label: string;
  modelName: string;
  enabled: boolean;
  capabilities: {
    reasoning: ReasoningControl;
    toolCalling: boolean | "unknown";
    streaming: boolean | "unknown";
    vision: boolean | "unknown";
    contextWindow?: number;
  };
  capabilitySource: "built-in" | "provider-api" | "probe" | "manual";
};

export type ModelSettings = {
  language: Language;
  intelligence: IntelligenceLevel;
  speed: SpeedMode;
  currentModelId: string | null;
  providers: ForgeProvider[];
  models: ForgeModel[];
};
```

- [ ] **Step 4: Add provider catalog seed data**

Create `src/shared/providerCatalog.ts`:

```ts
import type { ForgeModel, ForgeProvider } from "./modelTypes";

export const providerCatalog: ForgeProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    requiresBaseUrl: false
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    requiresBaseUrl: false
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    requiresBaseUrl: false
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresBaseUrl: false
  },
  {
    id: "custom-openai-compatible",
    label: "OpenAI Compatible",
    kind: "openai-compatible",
    requiresBaseUrl: true
  }
];

export const catalogModels: ForgeModel[] = [
  {
    id: "openai:gpt-5.5",
    providerId: "openai",
    label: "GPT-5.5",
    modelName: "gpt-5.5",
    enabled: false,
    capabilities: {
      reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "built-in"
  },
  {
    id: "anthropic:claude-sonnet",
    providerId: "anthropic",
    label: "Claude Sonnet",
    modelName: "claude-sonnet",
    enabled: false,
    capabilities: {
      reasoning: { type: "budget", min: 1024, max: 32000 },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "built-in"
  },
  {
    id: "gemini:gemini-2.5-pro",
    providerId: "gemini",
    label: "Gemini 2.5 Pro",
    modelName: "gemini-2.5-pro",
    enabled: false,
    capabilities: {
      reasoning: { type: "budget", min: 0, max: 32768 },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "built-in"
  }
];
```

- [ ] **Step 5: Add settings helpers**

Create `src/renderer/src/state/modelSettings.ts`:

```ts
import { catalogModels, providerCatalog } from "@shared/providerCatalog";
import type { ForgeModel, IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";

export function createDefaultModelSettings(): ModelSettings {
  return {
    language: "zh-CN",
    intelligence: "high",
    speed: "balanced",
    currentModelId: null,
    providers: providerCatalog,
    models: catalogModels
  };
}

export function getEnabledModels(settings: ModelSettings): ForgeModel[] {
  return settings.models.filter((model) => model.enabled);
}

export function updateModelEnabled(
  settings: ModelSettings,
  modelId: string,
  enabled: boolean
): ModelSettings {
  const models = settings.models.map((model) =>
    model.id === modelId ? { ...model, enabled } : model
  );

  const enabledModels = models.filter((model) => model.enabled);
  const currentModelStillEnabled = enabledModels.some((model) => model.id === settings.currentModelId);

  return {
    ...settings,
    models,
    currentModelId: currentModelStillEnabled ? settings.currentModelId : enabledModels[0]?.id ?? null
  };
}

export function setCurrentModel(settings: ModelSettings, modelId: string): ModelSettings {
  const model = settings.models.find((candidate) => candidate.id === modelId && candidate.enabled);

  if (!model) {
    return settings;
  }

  return {
    ...settings,
    currentModelId: model.id
  };
}

export function setIntelligence(
  settings: ModelSettings,
  intelligence: IntelligenceLevel
): ModelSettings {
  return { ...settings, intelligence };
}

export function setSpeed(settings: ModelSettings, speed: SpeedMode): ModelSettings {
  return { ...settings, speed };
}
```

- [ ] **Step 6: Run model settings tests**

Run:

```powershell
npm run test -- src/renderer/src/state/modelSettings.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit model settings**

Run:

```powershell
git add -- src/shared src/renderer/src/state
git commit -m "建立模型配置数据结构"
```

Expected: commit succeeds.

---

### Task 3: Add Chinese-First i18n Layer

**Files:**

- Create: `src/renderer/src/i18n/messages.ts`
- Create: `src/renderer/src/i18n/useI18n.ts`
- Create: `src/renderer/src/i18n/messages.test.ts`

- [ ] **Step 1: Write i18n tests first**

Create `src/renderer/src/i18n/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMessage, messages } from "./messages";

describe("messages", () => {
  it("uses Chinese as the default product language", () => {
    expect(getMessage("zh-CN", "app.tagline")).toBe("本地 AI 开发锻造台");
  });

  it("contains English text for language switching", () => {
    expect(getMessage("en-US", "app.tagline")).toBe("Local AI development forge");
  });

  it("keeps message keys aligned between languages", () => {
    expect(Object.keys(messages["zh-CN"]).sort()).toEqual(Object.keys(messages["en-US"]).sort());
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm run test -- src/renderer/src/i18n/messages.test.ts
```

Expected: FAIL because i18n files do not exist.

- [ ] **Step 3: Add message catalog**

Create `src/renderer/src/i18n/messages.ts`:

```ts
import type { Language } from "@shared/modelTypes";

export const messages = {
  "zh-CN": {
    "app.name": "Forge",
    "app.tagline": "本地 AI 开发锻造台",
    "nav.projects": "项目",
    "nav.threads": "任务",
    "nav.settings": "设置",
    "composer.placeholder": "描述你想锻造的代码任务",
    "composer.send": "开始",
    "selector.intelligence": "智能",
    "selector.low": "低",
    "selector.medium": "中",
    "selector.high": "高",
    "selector.xhigh": "超高",
    "selector.model": "模型",
    "selector.speed": "速度",
    "selector.fast": "快速",
    "selector.balanced": "均衡",
    "selector.careful": "谨慎",
    "selector.configureModel": "配置模型",
    "selector.noReasoning": "普通, 不可调",
    "settings.title": "模型设置",
    "settings.subtitle": "只启用你想在任务菜单中使用的模型",
    "settings.enabled": "启用"
  },
  "en-US": {
    "app.name": "Forge",
    "app.tagline": "Local AI development forge",
    "nav.projects": "Projects",
    "nav.threads": "Threads",
    "nav.settings": "Settings",
    "composer.placeholder": "Describe the code task you want to forge",
    "composer.send": "Start",
    "selector.intelligence": "Intelligence",
    "selector.low": "Low",
    "selector.medium": "Medium",
    "selector.high": "High",
    "selector.xhigh": "Ultra",
    "selector.model": "Model",
    "selector.speed": "Speed",
    "selector.fast": "Fast",
    "selector.balanced": "Balanced",
    "selector.careful": "Careful",
    "selector.configureModel": "Configure model",
    "selector.noReasoning": "Normal, fixed",
    "settings.title": "Model settings",
    "settings.subtitle": "Only enabled models appear in the task menu",
    "settings.enabled": "Enabled"
  }
} as const;

export type MessageKey = keyof (typeof messages)["zh-CN"];

export function getMessage(language: Language, key: MessageKey): string {
  return messages[language][key];
}
```

- [ ] **Step 4: Add translation hook**

Create `src/renderer/src/i18n/useI18n.ts`:

```ts
import type { Language } from "@shared/modelTypes";
import { getMessage, type MessageKey } from "./messages";

export function useI18n(language: Language): { t: (key: MessageKey) => string } {
  return {
    t: (key) => getMessage(language, key)
  };
}
```

- [ ] **Step 5: Run i18n tests**

Run:

```powershell
npm run test -- src/renderer/src/i18n/messages.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit i18n**

Run:

```powershell
git add -- src/renderer/src/i18n
git commit -m "加入中英双语文案"
```

Expected: commit succeeds.

---

### Task 4: Build App Shell and Settings Panel

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/AppShell.tsx`
- Create: `src/renderer/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Implement app shell components**

Create `src/renderer/src/components/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Language } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";

type AppShellProps = {
  language: Language;
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppShell({ language, sidebar, children }: AppShellProps): JSX.Element {
  const { t } = useI18n(language);

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[#101114] text-[#f5f4ef]">
      <aside className="border-r border-white/10 bg-[#15161a] px-4 py-5">
        <div className="mb-8">
          <div className="text-lg font-semibold tracking-normal">{t("app.name")}</div>
          <div className="mt-1 text-xs text-[#a8a29a]">{t("app.tagline")}</div>
        </div>
        <nav className="space-y-1 text-sm text-[#d7d3ca]">{sidebar}</nav>
      </aside>
      <section className="flex min-w-0 flex-col">{children}</section>
    </div>
  );
}
```

Create `src/renderer/src/components/SettingsPanel.tsx`:

```tsx
import type { ModelSettings } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";

type SettingsPanelProps = {
  settings: ModelSettings;
  onToggleModel: (modelId: string, enabled: boolean) => void;
};

export function SettingsPanel({ settings, onToggleModel }: SettingsPanelProps): JSX.Element {
  const { t } = useI18n(settings.language);

  return (
    <section className="border-t border-white/10 bg-[#15161a] px-6 py-5">
      <div className="mb-4">
        <h2 className="text-base font-medium">{t("settings.title")}</h2>
        <p className="mt-1 text-sm text-[#a8a29a]">{t("settings.subtitle")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {settings.models.map((model) => (
          <label
            key={model.id}
            className="flex items-center justify-between rounded-md border border-white/10 bg-[#1d1f24] px-3 py-3 text-sm"
          >
            <span>
              <span className="block text-[#f5f4ef]">{model.label}</span>
              <span className="block text-xs text-[#a8a29a]">{model.providerId}</span>
            </span>
            <input
              type="checkbox"
              checked={model.enabled}
              onChange={(event) => onToggleModel(model.id, event.currentTarget.checked)}
              aria-label={`${t("settings.enabled")} ${model.label}`}
              className="h-4 w-4"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Compose shell in App**

Replace `src/renderer/src/App.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useI18n } from "@/i18n/useI18n";
import {
  createDefaultModelSettings,
  updateModelEnabled
} from "@/state/modelSettings";

export function App(): JSX.Element {
  const [settings, setSettings] = useState(createDefaultModelSettings);
  const { t } = useI18n(settings.language);

  const sidebarItems = useMemo(
    () => [t("nav.projects"), t("nav.threads"), t("nav.settings")],
    [t]
  );

  return (
    <AppShell
      language={settings.language}
      sidebar={sidebarItems.map((item) => (
        <button
          key={item}
          className="flex h-9 w-full items-center rounded-md px-3 text-left hover:bg-white/8"
          type="button"
        >
          {item}
        </button>
      ))}
    >
      <div className="flex flex-1 flex-col px-8 py-6">
        <div className="flex-1 rounded-md border border-white/10 bg-[#15161a] p-6">
          <p className="text-sm text-[#a8a29a]">{t("app.tagline")}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{t("app.name")}</h1>
        </div>
      </div>
      <SettingsPanel
        settings={settings}
        onToggleModel={(modelId, enabled) =>
          setSettings((current) => updateModelEnabled(current, modelId, enabled))
        }
      />
    </AppShell>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit shell and settings panel**

Run:

```powershell
git add -- src/renderer/src/App.tsx src/renderer/src/components
git commit -m "实现 Forge 应用外壳"
```

Expected: commit succeeds.

---

### Task 5: Build Codex-Style Model Selector and Task Composer

**Files:**

- Create: `src/renderer/src/components/ModelSelector.tsx`
- Create: `src/renderer/src/components/TaskComposer.tsx`
- Create: `src/renderer/src/components/ModelSelector.test.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write selector behavior test first**

Create `src/renderer/src/components/ModelSelector.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, updateModelEnabled } from "@/state/modelSettings";
import { ModelSelector } from "./ModelSelector";

describe("ModelSelector", () => {
  it("shows only enabled models in the model submenu", async () => {
    const user = userEvent.setup();
    const settings = updateModelEnabled(createDefaultModelSettings(), "openai:gpt-5.5", true);

    render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /GPT-5.5/ }));
    await user.hover(screen.getByText("GPT-5.5"));

    expect(screen.getByText("GPT-5.5")).toBeInTheDocument();
    expect(screen.queryByText("Claude Sonnet")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm run test -- src/renderer/src/components/ModelSelector.test.tsx
```

Expected: FAIL because `ModelSelector.tsx` does not exist.

- [ ] **Step 3: Implement model selector**

Create `src/renderer/src/components/ModelSelector.tsx`:

```tsx
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Zap } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import { getEnabledModels } from "@/state/modelSettings";

type ModelSelectorProps = {
  settings: ModelSettings;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
};

const intelligenceLevels: IntelligenceLevel[] = ["low", "medium", "high", "xhigh"];
const speedModes: SpeedMode[] = ["fast", "balanced", "careful"];

export function ModelSelector({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed
}: ModelSelectorProps): JSX.Element {
  const { t } = useI18n(settings.language);
  const enabledModels = getEnabledModels(settings);
  const currentModel =
    enabledModels.find((model) => model.id === settings.currentModelId) ?? enabledModels[0] ?? null;

  const triggerLabel = currentModel
    ? `${currentModel.label}  ${t(`selector.${settings.intelligence}`)}`
    : t("selector.configureModel");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#d7d3ca] hover:bg-white/8"
          aria-label={triggerLabel}
        >
          <Zap className="h-4 w-4" />
          <span>{triggerLabel}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-lg border border-black/10 bg-[#f7f5f0] p-2 text-[#222] shadow-xl"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8a8178]">
            {t("selector.intelligence")}
          </DropdownMenu.Label>
          {intelligenceLevels.map((level) => (
            <DropdownMenu.Item
              key={level}
              onSelect={() => onSelectIntelligence(level)}
              className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6"
            >
              {t(`selector.${level}`)}
              {settings.intelligence === level ? <Check className="h-4 w-4" /> : null}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-2 h-px bg-black/10" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6">
              <span className="inline-flex items-center gap-2">
                <Zap className="h-4 w-4" />
                {currentModel?.label ?? t("selector.configureModel")}
              </span>
              <ChevronRight className="h-4 w-4" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="z-50 w-72 rounded-lg border border-black/10 bg-[#f7f5f0] p-2 text-[#222] shadow-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8a8178]">
                  {t("selector.model")}
                </DropdownMenu.Label>
                {enabledModels.map((model) => (
                  <DropdownMenu.Item
                    key={model.id}
                    onSelect={() => onSelectModel(model.id)}
                    className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6"
                  >
                    <span className="inline-flex items-center gap-2">
                      {model.capabilities.reasoning.type !== "none" ? <Zap className="h-4 w-4" /> : null}
                      {model.label}
                    </span>
                    {currentModel?.id === model.id ? <Check className="h-4 w-4" /> : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6">
              <span>{t("selector.speed")}</span>
              <ChevronRight className="h-4 w-4" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="z-50 w-56 rounded-lg border border-black/10 bg-[#f7f5f0] p-2 text-[#222] shadow-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8a8178]">
                  {t("selector.speed")}
                </DropdownMenu.Label>
                {speedModes.map((speed) => (
                  <DropdownMenu.Item
                    key={speed}
                    onSelect={() => onSelectSpeed(speed)}
                    className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6"
                  >
                    {t(`selector.${speed}`)}
                    {settings.speed === speed ? <Check className="h-4 w-4" /> : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 4: Implement task composer**

Create `src/renderer/src/components/TaskComposer.tsx`:

```tsx
import { ArrowUp } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import { ModelSelector } from "./ModelSelector";

type TaskComposerProps = {
  settings: ModelSettings;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
};

export function TaskComposer({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed
}: TaskComposerProps): JSX.Element {
  const { t } = useI18n(settings.language);

  return (
    <section className="border-t border-white/10 bg-[#101114] px-8 py-5">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/12 bg-[#f7f5f0] p-3 text-[#222] shadow-2xl">
        <textarea
          className="min-h-20 w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-[#8a8178]"
          placeholder={t("composer.placeholder")}
        />
        <div className="mt-2 flex items-center justify-between">
          <ModelSelector
            settings={settings}
            onSelectModel={onSelectModel}
            onSelectIntelligence={onSelectIntelligence}
            onSelectSpeed={onSelectSpeed}
          />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#222] text-white hover:bg-[#333]"
            aria-label={t("composer.send")}
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire selector into App**

Modify `src/renderer/src/App.tsx` to import `TaskComposer`, `setCurrentModel`, `setIntelligence`, and `setSpeed`, then render the composer above settings:

```tsx
import {
  createDefaultModelSettings,
  setCurrentModel,
  setIntelligence,
  setSpeed,
  updateModelEnabled
} from "@/state/modelSettings";
import { TaskComposer } from "@/components/TaskComposer";
```

Add this JSX before `SettingsPanel`:

```tsx
<TaskComposer
  settings={settings}
  onSelectModel={(modelId) => setSettings((current) => setCurrentModel(current, modelId))}
  onSelectIntelligence={(level) => setSettings((current) => setIntelligence(current, level))}
  onSelectSpeed={(speed) => setSettings((current) => setSpeed(current, speed))}
/>
```

- [ ] **Step 6: Add test setup**

Create `src/renderer/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Update `electron.vite.config.ts` renderer config:

```ts
renderer: {
  test: {
    environment: "jsdom",
    setupFiles: ["src/renderer/src/test/setup.ts"]
  },
  resolve: {
    alias: {
      "@": resolve("src/renderer/src"),
      "@shared": resolve("src/shared")
    }
  },
  plugins: [react(), tailwindcss()]
}
```

- [ ] **Step 7: Run selector tests and typecheck**

Run:

```powershell
npm run test -- src/renderer/src/components/ModelSelector.test.tsx
npm run typecheck
```

Expected: both commands exit with code `0`.

- [ ] **Step 8: Commit selector**

Run:

```powershell
git add -- src/renderer/src/App.tsx src/renderer/src/components src/renderer/src/test electron.vite.config.ts
git commit -m "实现模型选择器和任务输入框"
```

Expected: commit succeeds.

---

### Task 6: Final Verification

**Files:**

- Modify only files changed in previous tasks if verification exposes a specific defect.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm run test
npm run typecheck
npm run build
```

Expected: all commands exit with code `0`.

- [ ] **Step 2: Launch the desktop app**

Run:

```powershell
npm run dev
```

Expected: Electron opens a Forge window with Chinese UI, sidebar, settings panel, and bottom task composer.

- [ ] **Step 3: Manual UI smoke test**

Verify:

- The window title is Forge
- The tagline is `本地 AI 开发锻造台`
- The settings panel lists GPT-5.5, Claude Sonnet, and Gemini 2.5 Pro
- No model appears in the selector until enabled
- Enabling GPT-5.5 makes it appear in the model selector
- Intelligence menu shows `低`, `中`, `高`, `超高`
- Speed submenu shows `快速`, `均衡`, `谨慎`

- [ ] **Step 4: Check Git status**

Run:

```powershell
git status --short
```

Expected: no uncommitted changes except intentional verification fixes.

- [ ] **Step 5: Push successful implementation**

Run:

```powershell
git push origin main
```

Expected: push succeeds without force.

---

## Self-Review

Spec coverage:

- Product shell: covered by Task 1 and Task 4
- Default Chinese and bilingual resources: covered by Task 3
- Codex-style model selector: covered by Task 5
- Only enabled models in task menu: covered by Task 2 and Task 5
- Provider catalog concept: covered by Task 2
- Speed menu retained: covered by Task 5
- No voice input: intentionally absent from files and UI

Placeholder scan:

- No placeholder tokens are used.
- No incomplete file paths are used.
- All commands are PowerShell-compatible.

Type consistency:

- `IntelligenceLevel` is consistently `low | medium | high | xhigh`.
- `SpeedMode` is consistently `fast | balanced | careful`.
- `ModelSettings.currentModelId` is the single source of selected model state.
