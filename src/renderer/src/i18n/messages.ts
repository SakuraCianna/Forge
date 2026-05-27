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
    "settings.enabled": "启用",
    "settings.language": "界面语言",
    "settings.providers": "模型提供商",
    "settings.models": "可用模型",
    "settings.saveKey": "保存",
    "settings.deleteKey": "删除",
    "settings.fetchModels": "拉取模型",
    "settings.keySaved": "已保存",
    "settings.keyMissing": "未保存"
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
    "settings.enabled": "Enabled",
    "settings.language": "Interface language",
    "settings.providers": "Model providers",
    "settings.models": "Available models",
    "settings.saveKey": "Save",
    "settings.deleteKey": "Delete",
    "settings.fetchModels": "Fetch models",
    "settings.keySaved": "Saved",
    "settings.keyMissing": "Missing"
  }
} as const;

export type MessageKey = keyof (typeof messages)["zh-CN"];

export function getMessage(language: Language, key: MessageKey): string {
  return messages[language][key];
}
