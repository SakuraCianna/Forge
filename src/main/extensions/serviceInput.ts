// 本文件说明: 提供服务扩展共享的输入读取、URL 规范化和输出摘要辅助函数
import { Buffer } from "node:buffer";

const maxListLimit = 100;

export function readRequiredString(value: unknown, fieldName: string, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return normalized;
}

export function readOptionalString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function readRequiredIsoDate(value: unknown, fieldName: string): string {
  const text = readRequiredString(value, fieldName, 120);
  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date-time`);
  }

  return text;
}

export function readOptionalStringList(
  value: unknown,
  fieldName: string,
  maxLength: number
): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,]/u)
      : [];
  const normalized = values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} has too many values`);
  }

  return normalized;
}

export function readLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maxListLimit, Math.max(1, Math.round(value)));
}

export function normalizeHttpsOrigin(value: string, label: string): string {
  const normalized = value.trim().replace(/\/+$/u, "");
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid https URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https`);
  }

  return parsed.origin;
}

export function normalizeZendeskSubdomain(value: string): string {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\.zendesk\.com.*$/u, "")
    .replace(/\/.*$/u, "")
    .toLowerCase();

  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error("Zendesk subdomain is invalid");
  }

  return normalized;
}

export function normalizeShopifyStoreDomain(value: string): string {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(normalized)) {
    throw new Error("Shopify store domain must look like example.myshopify.com");
  }

  return normalized;
}

export function normalizeDatadogSite(value: string): string {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/^api\./u, "")
    .replace(/\/.*$/u, "")
    .toLowerCase();

  if (!/^[a-z0-9.-]+$/u.test(normalized)) {
    throw new Error("Datadog site is invalid");
  }

  return normalized;
}

export function normalizeFreshdeskDomain(value: string): string {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .toLowerCase();
  const domain = normalized.endsWith(".freshdesk.com")
    ? normalized
    : `${normalizeSimpleHostLabel(normalized, "Freshdesk domain")}.freshdesk.com`;

  if (!/^[a-z0-9][a-z0-9-]*\.freshdesk\.com$/u.test(domain)) {
    throw new Error("Freshdesk domain must look like example.freshdesk.com");
  }

  return domain;
}

export function normalizeSimpleHostLabel(value: string, label: string): string {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]*$/u.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }

  return normalized;
}

export function createBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

export function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function withQuery(url: string, query: Record<string, string> | undefined): string {
  if (!query) {
    return url;
  }

  const parsed = new URL(url);

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      parsed.searchParams.set(key, value);
    }
  }

  return parsed.toString();
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function toOutputRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { result: value };
}

export function readObjectText(value: unknown, field: string, fallback: string): string {
  const candidate = readRecord(value)[field];
  return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
}

export function readNestedObjectText(value: unknown, fields: string[], fallback: string): string {
  let current: unknown = value;

  for (const field of fields) {
    current = readRecord(current)[field];
  }

  return typeof current === "string" && current.trim() ? current : fallback;
}

export function readNestedRecord(value: unknown, fields: string[]): Record<string, unknown> {
  let current: unknown = value;

  for (const field of fields) {
    current = readRecord(current)[field];
  }

  return readRecord(current);
}

export function readArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function readCollectionLength(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }

  return readArrayLength(readRecord(value).results);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
