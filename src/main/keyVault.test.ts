// 本文件说明: 主进程 密钥保险库测试
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createKeyVault } from "./keyVault";

const testRoot = join(process.cwd(), ".tmp-test", "key-vault");

const codec = {
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8").replace(/^encrypted:/, "")
};

describe("keyVault", () => {
  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("stores provider API keys without writing plaintext to disk", async () => {
    await mkdir(testRoot, { recursive: true });
    const vault = createKeyVault({ directory: testRoot, codec });

    await vault.saveProviderKey("openai", "sk-secret-123456");

    const rawFile = await readFile(join(testRoot, "forge-secrets.json"), "utf8");

    expect(rawFile).not.toContain("sk-secret-123456");
    await expect(vault.readProviderKey("openai")).resolves.toBe("sk-secret-123456");
  });

  it("returns safe key status metadata", async () => {
    await mkdir(testRoot, { recursive: true });
    const vault = createKeyVault({ directory: testRoot, codec });

    await vault.saveProviderKey("anthropic", "sk-ant-abcdef");

    await expect(vault.getProviderKeyStatus("anthropic")).resolves.toEqual({
      hasKey: true,
      last4: "cdef"
    });
  });

  it("deletes provider API keys", async () => {
    await mkdir(testRoot, { recursive: true });
    const vault = createKeyVault({ directory: testRoot, codec });

    await vault.saveProviderKey("gemini", "gemini-secret");
    await vault.deleteProviderKey("gemini");

    await expect(vault.getProviderKeyStatus("gemini")).resolves.toEqual({
      hasKey: false,
      last4: null
    });
  });
});
