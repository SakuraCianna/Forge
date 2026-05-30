// 本文件说明: 渲染状态 对话路由状态
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

export function isDirectAnswerPrompt(prompt: string): boolean {
  const normalizedPrompt = normalizePrompt(prompt);

  if (isPlainChatPrompt(normalizedPrompt)) {
    return true;
  }

  if (!normalizedPrompt) {
    return false;
  }

  if (hasMemoryIntent(normalizedPrompt)) {
    return true;
  }

  if (hasProjectActionIntent(normalizedPrompt)) {
    return false;
  }

  return hasAnswerIntent(normalizedPrompt);
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasMemoryIntent(prompt: string): boolean {
  return /(?:请记住|记住|以后记得|帮我记住|remember|note that)[:：,\s]+/iu.test(prompt);
}

function hasAnswerIntent(prompt: string): boolean {
  return (
    /[?？]$/.test(prompt) ||
    /(是什么|做了什么|能做什么|可以做什么|能够做什么|有什么|有哪些|为什么|怎么回事|解释|介绍|概览|总结|说明|讲讲|看懂|分析一下)/u.test(prompt)
  );
}

function hasProjectActionIntent(prompt: string): boolean {
  return /(修复|实现|添加|新增|删除|移除|改成|修改|重构|运行|测试|构建|提交|保存|生成|接入|安装|升级)/u.test(
    prompt
  );
}
