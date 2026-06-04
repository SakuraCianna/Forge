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

  if (isContinuationPrompt(normalizedPrompt)) {
    return false;
  }

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

  if (isProjectUnderstandingPrompt(normalizedPrompt)) {
    return true;
  }

  return hasAnswerIntent(normalizedPrompt);
}

// 归一化输入文本, 让中英文意图匹配都更稳定
function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

// 识别“继续上一轮任务”的短指令, 不能把它当成普通聊天或新的项目需求
export function isContinuationPrompt(prompt: string): boolean {
  const normalizedPrompt = normalizePrompt(prompt).replace(/[!！。.?？\s]+$/g, "");

  if (!normalizedPrompt || normalizedPrompt.length > 36) {
    return false;
  }

  return (
    /^(继续|继续完成|继续执行|继续做|接着|接着做|往下做|恢复|恢复执行|继续完成我要求的任务)$/u.test(
      normalizedPrompt
    ) ||
    /^继续(完成|执行|做)?(我)?(之前|前面|刚才)?(要求|说的|提出的)?的?任务$/u.test(
      normalizedPrompt
    ) ||
    /^(continue|resume|keep going|carry on)$/iu.test(normalizedPrompt)
  );
}

// 识别用户显式要求记住的表达, 交给记忆模块处理
function hasMemoryIntent(prompt: string): boolean {
  return /(?:请记住|记住|以后记得|帮我记住|remember|note that)[:：,\s]+/iu.test(prompt);
}

// 识别解释和询问类表达, 让它们保持普通回答体验
function hasAnswerIntent(prompt: string): boolean {
  return (
    /[?？]$/.test(prompt) ||
    /(是谁|谁是|是什么|做了什么|能做什么|可以做什么|能够做什么|有什么|有哪些|为什么|怎么回事|解释|介绍|概览|总结|说明|讲讲|看懂|分析一下|告诉我)/u.test(prompt)
  );
}

// 识别项目理解类问题, 这类请求需要直接给出对话式结论, 不应只生成工具执行摘要
export function isProjectUnderstandingPrompt(prompt: string): boolean {
  const normalizedPrompt = normalizePrompt(prompt);

  return (
    /(项目|代码|仓库|工程).*(干啥|干什么|做什么|是干嘛|用途|介绍|概览|总结|说明|架构|结构)/u.test(
      normalizedPrompt
    ) ||
    /(查看|看看|看一下|分析).*(我的|这个|当前).*(项目|代码|仓库|工程)/u.test(normalizedPrompt) ||
    /(tell me|explain|summari[sz]e|overview).*(project|codebase|repository|repo)/iu.test(
      normalizedPrompt
    )
  );
}

// 直接问答只能续写同一项目或同一空白工作区, 防止不同项目的线程历史串进当前问题
export function canAppendDirectAnswerToThread(
  threadProjectPath: string | null | undefined,
  currentProjectPath: string | null | undefined
): boolean {
  const normalizedThreadProjectPath = normalizeProjectPathForConversationScope(threadProjectPath);
  const normalizedCurrentProjectPath = normalizeProjectPathForConversationScope(currentProjectPath);

  return normalizedThreadProjectPath === normalizedCurrentProjectPath;
}

// 识别修改, 运行, 修复等项目动作意图
function hasProjectActionIntent(prompt: string): boolean {
  return /(修复|实现|添加|新增|删除|移除|改成|修改|重构|运行|测试|构建|提交|保存|生成|接入|安装|升级|写|写入|创建|新建|create|write|save|generate|add|implement|fix|run|test|build)/iu.test(
    prompt
  );
}

function normalizeProjectPathForConversationScope(
  projectPath: string | null | undefined
): string | null {
  const normalizedProjectPath = projectPath?.trim().replace(/\\/g, "/").toLowerCase();

  return normalizedProjectPath || null;
}
