// 本文件说明: 判断用户输入是普通问答还是项目执行意图
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

// 识别寒暄类短输入, 这类内容只让模型自然回答
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

// 判断是否应该直接回答, 避免问答被强行转成执行模板
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

// 归一化输入文本, 让中英文意图匹配都更稳定
function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

// 识别用户显式要求记住的表达, 交给记忆模块处理
function hasMemoryIntent(prompt: string): boolean {
  return /(?:请记住|记住|以后记得|帮我记住|remember|note that)[:：,\s]+/iu.test(prompt);
}

// 识别解释和询问类表达, 让它们保持普通回答体验
function hasAnswerIntent(prompt: string): boolean {
  return (
    /[?？]$/.test(prompt) ||
    /(是什么|做了什么|能做什么|可以做什么|能够做什么|有什么|有哪些|为什么|怎么回事|解释|介绍|概览|总结|说明|讲讲|看懂|分析一下)/u.test(prompt)
  );
}

// 识别修改, 运行, 修复等项目动作意图
function hasProjectActionIntent(prompt: string): boolean {
  return /(修复|实现|添加|新增|删除|移除|改成|修改|重构|运行|测试|构建|提交|保存|生成|接入|安装|升级)/u.test(
    prompt
  );
}
