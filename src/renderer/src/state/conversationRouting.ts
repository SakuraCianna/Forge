const plainChatPatterns = [
  /^hi$/,
  /^hello$/,
  /^hey$/,
  /^ok$/,
  /^thanks$/,
  /^你好$/,
  /^您好$/,
  /^嗨$/,
  /^在吗$/,
  /^谢谢$/,
  /^好的$/
];

export function isPlainChatPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt
    .trim()
    .toLowerCase()
    .replace(/[!！。.?？\s]+$/g, "");

  if (!normalizedPrompt || normalizedPrompt.length > 16) {
    return false;
  }

  return plainChatPatterns.some((pattern) => pattern.test(normalizedPrompt));
}
