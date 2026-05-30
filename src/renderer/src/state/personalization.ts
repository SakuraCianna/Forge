// 本文件说明: 渲染状态 个性化状态
const personalizationStorageKey = "forge.personalization";

export type ReplyTone = "friendly" | "concise" | "technical";

export type PersonalizationSettings = {
  replyTone: ReplyTone;
  customInstructions: string;
};

export function createDefaultPersonalizationSettings(): PersonalizationSettings {
  return {
    replyTone: "friendly",
    customInstructions: ""
  };
}

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

export function savePersonalizationSettings(
  storage: Storage,
  settings: PersonalizationSettings
): void {
  storage.setItem(personalizationStorageKey, JSON.stringify(settings));
}

export function createPersonalizationPrompt(settings: PersonalizationSettings): string {
  const toneInstruction =
    settings.replyTone === "concise"
      ? "Use a concise, direct engineering tone."
      : settings.replyTone === "technical"
        ? "Use a precise, technical engineering tone with concrete implementation detail."
        : "Use a friendly, collaborative engineering tone.";

  return [toneInstruction, settings.customInstructions.trim()].filter(Boolean).join("\n");
}

function isReplyTone(value: unknown): value is ReplyTone {
  return value === "friendly" || value === "concise" || value === "technical";
}
