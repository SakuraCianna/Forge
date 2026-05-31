// 本文件说明: 保存回答风格偏好并生成模型可读的个性化提示
const personalizationStorageKey = "forge.personalization";

type ReplyTone = "friendly" | "concise" | "technical";

export type PersonalizationSettings = {
  replyTone: ReplyTone;
  customInstructions: string;
};

// 创建个性化默认值, 默认保持简洁回答
export function createDefaultPersonalizationSettings(): PersonalizationSettings {
  return {
    replyTone: "friendly",
    customInstructions: ""
  };
}

// 从 localStorage 读取个性化设置, 无效值回退到默认值
export function loadPersonalizationSettings(storage: Storage): PersonalizationSettings {
  const rawValue = storage.getItem(personalizationStorageKey);

  if (!rawValue) {
    return createDefaultPersonalizationSettings();
  }

  try {
    const value = JSON.parse(rawValue) as Partial<PersonalizationSettings>;

    return {
      replyTone: isReplyTone(value.replyTone) ? value.replyTone : "friendly",
      customInstructions:
        typeof value.customInstructions === "string" ? value.customInstructions : ""
    };
  } catch {
    return createDefaultPersonalizationSettings();
  }
}

// 保存个性化设置, 让后续模型请求继续沿用
export function savePersonalizationSettings(
  storage: Storage,
  settings: PersonalizationSettings
): void {
  storage.setItem(personalizationStorageKey, JSON.stringify(settings));
}

// 把界面里的语气选择转换成系统提示追加文本
export function createPersonalizationPrompt(settings: PersonalizationSettings): string {
  const toneInstruction =
    settings.replyTone === "concise"
      ? "Use a concise, direct engineering tone."
      : settings.replyTone === "technical"
        ? "Use a precise, technical engineering tone with concrete implementation detail."
        : "Use a friendly, collaborative engineering tone.";

  return [toneInstruction, settings.customInstructions.trim()].filter(Boolean).join("\n");
}

// 校验持久化语气字段, 避免未知值进入提示词
function isReplyTone(value: unknown): value is ReplyTone {
  return value === "friendly" || value === "concise" || value === "technical";
}
