// 本文件说明: QQ Mail 内置 Extension, 使用授权码通过 IMAP/SMTP 读写邮件
import { ImapFlow, type FetchMessageObject, type MessageAddressObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type {
  ExtensionActionDefinition,
  ExtensionManifest
} from "../../shared/extensionTypes.js";

export type ExtensionActionHandlerContext = {
  readSecret: (fieldId: string) => Promise<string | null>;
};

export type ExtensionActionHandlerResult = {
  output: Record<string, unknown>;
  outputSummary: string;
};

export type ExtensionActionHandler = (
  input: Record<string, unknown>,
  context: ExtensionActionHandlerContext
) => Promise<ExtensionActionHandlerResult>;

const qqMailExtensionId = "qq-mail";
const inboxMailbox = "INBOX";
const defaultDraftMailboxes = ["Drafts", "草稿箱", "Draft"];
const defaultListLimit = 20;
const maxListLimit = 50;
const maxSearchScan = 200;
const maxBodyChars = 12_000;
const maxDraftBodyChars = 60_000;
const maxSubjectChars = 200;
const maxRecipientCount = 20;

export const qqMailManifest: ExtensionManifest = {
  id: qqMailExtensionId,
  name: "QQ Mail",
  description: "读取, 搜索, 起草和发送 QQ 邮箱邮件",
  version: "0.2.0",
  category: "mail",
  builtIn: true,
  auth: {
    type: "secret",
    fields: [
      {
        id: "email",
        label: "QQ 邮箱地址",
        description: "例如 name@qq.com"
      },
      {
        id: "authorizationCode",
        label: "授权码",
        description: "QQ 邮箱设置中生成的 IMAP/SMTP 授权码",
        placeholder: "不是 QQ 密码"
      }
    ]
  },
  permissions: [
    {
      id: "mail.read",
      label: "读取邮件",
      description: "允许读取收件箱摘要和单封邮件内容",
      defaultMode: "ask"
    },
    {
      id: "mail.search",
      label: "搜索邮件",
      description: "允许按关键词, 发件人和时间搜索邮件摘要",
      defaultMode: "ask"
    },
    {
      id: "mail.draft",
      label: "创建草稿",
      description: "允许把邮件写入 QQ 邮箱草稿箱",
      defaultMode: "ask"
    },
    {
      id: "mail.send",
      label: "发送邮件",
      description: "允许通过 QQ 邮箱 SMTP 发送真实邮件",
      defaultMode: "ask"
    }
  ],
  actions: [
    createAction({
      id: "listInbox",
      label: "列出收件箱",
      description: "读取最近的收件箱邮件摘要",
      permission: "mail.read",
      risk: "read",
      confirmation: "ask",
      properties: {
        limit: { type: "number", description: "最多返回邮件数, 默认 20, 最大 50" }
      }
    }),
    createAction({
      id: "readEmail",
      label: "读取邮件",
      description: "按 UID 读取单封邮件正文和附件摘要",
      permission: "mail.read",
      risk: "read",
      confirmation: "ask",
      required: ["uid"],
      properties: {
        uid: { type: "number", description: "IMAP UID" }
      }
    }),
    createAction({
      id: "searchEmails",
      label: "搜索邮件",
      description: "在最近邮件中按关键词, 发件人和时间过滤",
      permission: "mail.search",
      risk: "read",
      confirmation: "ask",
      properties: {
        query: { type: "string", description: "主题, 发件人或正文预览关键词" },
        from: { type: "string", description: "发件人邮箱或名称片段" },
        since: { type: "string", description: "ISO 日期下限" },
        before: { type: "string", description: "ISO 日期上限" },
        limit: { type: "number", description: "最多返回邮件数" }
      }
    }),
    createAction({
      id: "createDraft",
      label: "创建草稿",
      description: "把邮件写入 QQ 邮箱草稿箱",
      permission: "mail.draft",
      risk: "write",
      confirmation: "ask",
      required: ["to", "subject", "text"],
      properties: createMailComposeProperties()
    }),
    createAction({
      id: "sendEmail",
      label: "发送邮件",
      description: "通过 QQ 邮箱 SMTP 发送真实邮件",
      permission: "mail.send",
      risk: "send",
      confirmation: "always",
      required: ["to", "subject", "text"],
      properties: createMailComposeProperties()
    })
  ]
};

export const qqMailHandlers: Record<string, ExtensionActionHandler> = {
  listInbox: async (input, context) => {
    const limit = readLimit(input.limit, defaultListLimit);
    const messages = await withImapClient(context, async (client) => {
      const mailbox = await client.mailboxOpen(inboxMailbox, { readOnly: true });
      const range = createRecentSequenceRange(mailbox.exists, limit);
      const summaries: EmailSummary[] = [];

      if (!range) {
        return summaries;
      }

      for await (const message of client.fetch(range, createSummaryFetchQuery())) {
        summaries.push(createEmailSummary(message));
      }

      return summaries.reverse();
    });

    return {
      output: { messages },
      outputSummary: `读取收件箱 ${messages.length} 封邮件摘要`
    };
  },
  readEmail: async (input, context) => {
    const uid = readRequiredInteger(input.uid, "uid");
    const email = await withImapClient(context, async (client) => {
      await client.mailboxOpen(inboxMailbox, { readOnly: true });
      const message = await client.fetchOne(uid, {
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
        source: { maxLength: 512_000 },
        uid: true
      }, { uid: true });

      if (!message || !message.source) {
        throw new Error(`Email not found: ${uid}`);
      }

      const parsed = await simpleParser(message.source);

      return {
        ...createEmailSummary(message),
        text: truncateText(parsed.text ?? "", maxBodyChars),
        htmlPreview: truncateText(stripHtml(parsed.html || ""), maxBodyChars),
        attachments: parsed.attachments.map((attachment) => ({
          contentType: attachment.contentType,
          filename: attachment.filename ?? "attachment",
          size: attachment.size
        }))
      };
    });

    return {
      output: { email },
      outputSummary: `读取邮件: ${email.subject || "(无主题)"}`
    };
  },
  searchEmails: async (input, context) => {
    const query = readOptionalString(input.query, 120).toLocaleLowerCase();
    const from = readOptionalString(input.from, 120).toLocaleLowerCase();
    const since = readOptionalDate(input.since);
    const before = readOptionalDate(input.before);
    const limit = readLimit(input.limit, defaultListLimit);
    const messages = await withImapClient(context, async (client) => {
      const mailbox = await client.mailboxOpen(inboxMailbox, { readOnly: true });
      const range = createRecentSequenceRange(mailbox.exists, Math.min(maxSearchScan, mailbox.exists));
      const matches: EmailSummary[] = [];

      if (!range) {
        return matches;
      }

      for await (const message of client.fetch(range, createSummaryFetchQuery())) {
        const summary = createEmailSummary(message);

        if (
          matchesSearchFilters(summary, {
            before,
            from,
            query,
            since
          })
        ) {
          matches.push(summary);
        }
      }

      return matches.reverse().slice(0, limit);
    });

    return {
      output: { messages },
      outputSummary: `搜索到 ${messages.length} 封邮件`
    };
  },
  createDraft: async (input, context) => {
    const compose = readComposeInput(input);
    const rawMessage = await createRawMessage(compose, context);
    const result = await withImapClient(context, async (client) => {
      const mailbox = await findDraftMailbox(client);
      const appended = await client.append(mailbox, rawMessage, ["\\Draft"], new Date());

      if (!appended) {
        throw new Error("QQ Mail did not accept the draft message");
      }

      return {
        mailbox,
        uid: appended.uid ?? null
      };
    });

    return {
      output: {
        draft: {
          ...result,
          subject: compose.subject,
          to: compose.to
        }
      },
      outputSummary: `已创建草稿: ${compose.subject}`
    };
  },
  sendEmail: async (input, context) => {
    const compose = readComposeInput(input);
    const { email, authorizationCode } = await readCredentials(context);
    const transporter = nodemailer.createTransport({
      auth: {
        pass: authorizationCode,
        user: email
      },
      host: "smtp.qq.com",
      port: 465,
      secure: true
    });
    const info = await transporter.sendMail({
      from: email,
      to: compose.to,
      cc: compose.cc,
      bcc: compose.bcc,
      subject: compose.subject,
      text: compose.text
    });
    const smtpInfo = info as {
      accepted?: unknown[];
      messageId?: string;
      rejected?: unknown[];
      response?: string;
    };

    return {
      output: {
        accepted: smtpInfo.accepted ?? [],
        rejected: smtpInfo.rejected ?? [],
        messageId: smtpInfo.messageId ?? null,
        response: smtpInfo.response ?? ""
      },
      outputSummary: `已发送邮件: ${compose.subject} -> ${compose.to.join(", ")}`
    };
  }
};

type EmailSummary = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  size: number | null;
  seen: boolean;
};

type ComposeInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
};

function createAction({
  confirmation,
  description,
  id,
  label,
  permission,
  properties,
  required = [],
  risk
}: Pick<
  ExtensionActionDefinition,
  "confirmation" | "description" | "id" | "label" | "permission" | "risk"
> & {
  properties: Record<string, unknown>;
  required?: string[];
}): ExtensionActionDefinition {
  return {
    id,
    label,
    description,
    permission,
    risk,
    confirmation,
    inputSchema: {
      type: "object",
      properties,
      required
    },
    outputSchema: {
      type: "object",
      properties: {}
    }
  };
}

function createMailComposeProperties(): Record<string, unknown> {
  return {
    to: { type: "array", items: { type: "string" }, description: "收件人邮箱列表" },
    cc: { type: "array", items: { type: "string" }, description: "抄送邮箱列表" },
    bcc: { type: "array", items: { type: "string" }, description: "密送邮箱列表" },
    subject: { type: "string", description: "邮件主题" },
    text: { type: "string", description: "纯文本正文" }
  };
}

async function withImapClient<T>(
  context: ExtensionActionHandlerContext,
  run: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const { email, authorizationCode } = await readCredentials(context);
  const client = new ImapFlow({
    auth: {
      pass: authorizationCode,
      user: email
    },
    host: "imap.qq.com",
    logger: false,
    port: 993,
    secure: true
  });

  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function readCredentials(context: ExtensionActionHandlerContext): Promise<{
  authorizationCode: string;
  email: string;
}> {
  const email = await context.readSecret("email");
  const authorizationCode = await context.readSecret("authorizationCode");

  if (!email || !authorizationCode) {
    throw new Error("QQ Mail credentials are not configured");
  }

  return { authorizationCode, email };
}

function createRecentSequenceRange(totalMessages: number, limit: number): string | null {
  if (totalMessages <= 0) {
    return null;
  }

  const start = Math.max(1, totalMessages - limit + 1);

  return `${start}:*`;
}

function createSummaryFetchQuery(): Parameters<ImapFlow["fetch"]>[1] {
  return {
    envelope: true,
    flags: true,
    internalDate: true,
    size: true,
    uid: true
  };
}

function createEmailSummary(message: FetchMessageObject): EmailSummary {
  return {
    uid: message.uid,
    subject: message.envelope?.subject ?? "",
    from: formatMessageAddresses(message.envelope?.from),
    to: formatMessageAddresses(message.envelope?.to),
    date: normalizeDateValue(message.envelope?.date ?? message.internalDate),
    size: message.size ?? null,
    seen: Boolean(message.flags?.has("\\Seen"))
  };
}

function formatMessageAddresses(addresses: MessageAddressObject[] | undefined): string {
  return addresses
    ?.map((address) => formatAddress(address.name, address.address))
    .filter(Boolean)
    .join(", ") ?? "";
}

function formatAddress(name: string | undefined, address: string | undefined): string {
  if (name && address) {
    return `${name} <${address}>`;
  }

  return address ?? name ?? "";
}

function normalizeDateValue(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function matchesSearchFilters(
  summary: EmailSummary,
  filters: {
    before: Date | null;
    from: string;
    query: string;
    since: Date | null;
  }
): boolean {
  const date = summary.date ? new Date(summary.date) : null;

  if (filters.since && date && date < filters.since) {
    return false;
  }

  if (filters.before && date && date >= filters.before) {
    return false;
  }

  if (filters.from && !summary.from.toLocaleLowerCase().includes(filters.from)) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  return `${summary.subject} ${summary.from} ${summary.to}`.toLocaleLowerCase().includes(filters.query);
}

async function findDraftMailbox(client: ImapFlow): Promise<string> {
  const mailboxes = await client.list({
    specialUseHints: {
      drafts: "Drafts"
    }
  });
  const specialUseDraft = mailboxes.find((mailbox) => mailbox.specialUse === "\\Drafts")?.path;

  if (specialUseDraft) {
    return specialUseDraft;
  }

  const namedDraft = defaultDraftMailboxes
    .map((name) => mailboxes.find((mailbox) => mailbox.name === name || mailbox.path === name)?.path)
    .find((path): path is string => Boolean(path));

  return namedDraft ?? defaultDraftMailboxes[0];
}

async function createRawMessage(
  compose: ComposeInput,
  context: ExtensionActionHandlerContext
): Promise<Buffer> {
  const { email } = await readCredentials(context);
  const transporter = nodemailer.createTransport({
    buffer: true,
    newline: "unix",
    streamTransport: true
  });
  const info = await transporter.sendMail({
    from: email,
    to: compose.to,
    cc: compose.cc,
    bcc: compose.bcc,
    subject: compose.subject,
    text: compose.text
  });
  const rawMessage = (info as { message?: unknown }).message;

  if (Buffer.isBuffer(rawMessage)) {
    return rawMessage;
  }

  if (typeof rawMessage === "string") {
    return Buffer.from(rawMessage, "utf8");
  }

  throw new Error("Could not build draft MIME message");
}

function readComposeInput(input: Record<string, unknown>): ComposeInput {
  return {
    to: readEmailList(input.to, "to"),
    cc: readOptionalEmailList(input.cc, "cc"),
    bcc: readOptionalEmailList(input.bcc, "bcc"),
    subject: readRequiredString(input.subject, "subject", maxSubjectChars),
    text: readRequiredString(input.text, "text", maxDraftBodyChars)
  };
}

function readLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maxListLimit, Math.max(1, Math.round(value)));
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return value;
}

function readRequiredString(value: unknown, fieldName: string, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return normalized;
}

function readOptionalString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function readOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

function readEmailList(value: unknown, fieldName: string): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,]/u)
      : [];
  const emails = values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error(`${fieldName} must include at least one email address`);
  }

  if (emails.length > maxRecipientCount) {
    throw new Error(`${fieldName} has too many recipients`);
  }

  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      throw new Error(`${fieldName} contains an invalid email address`);
    }
  }

  return emails;
}

function readOptionalEmailList(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return readEmailList(value, fieldName);
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}\n[truncated]`;
}

function stripHtml(value: string): string {
  return value.replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function createQQMailInputSummary(actionId: string, input: Record<string, unknown>): string {
  if (actionId === "sendEmail" || actionId === "createDraft") {
    const to = Array.isArray(input.to) ? input.to.join(", ") : String(input.to ?? "");
    const subject = typeof input.subject === "string" ? input.subject : "";

    return `${actionId}: ${subject || "(无主题)"} -> ${to}`;
  }

  if (actionId === "readEmail") {
    return `readEmail uid=${String(input.uid ?? "")}`;
  }

  if (actionId === "searchEmails") {
    return `searchEmails query=${String(input.query ?? "")}`;
  }

  return `${actionId} limit=${String(input.limit ?? defaultListLimit)}`;
}
