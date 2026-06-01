// 本文件说明: 在用户数据目录加密保存供应商 API Key
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type KeyVaultCodec = {
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
};

type KeyVaultOptions = {
  directory: string;
  codec: KeyVaultCodec;
};

type SecretRecord = {
  encryptedValue: string;
  last4: string;
};

type SecretFile = {
  providerKeys: Record<string, SecretRecord>;
};

export type ProviderKeyStatus = {
  hasKey: boolean;
  last4: string | null;
};

// 创建基于文件的密钥保险库, 加解密能力由 Electron safeStorage 注入
export function createKeyVault({ directory, codec }: KeyVaultOptions): {
  saveProviderKey: (providerId: string, apiKey: string) => Promise<void>;
  readProviderKey: (providerId: string) => Promise<string | null>;
  getProviderKeyStatus: (providerId: string) => Promise<ProviderKeyStatus>;
  deleteProviderKey: (providerId: string) => Promise<void>;
  clearProviderKeys: () => Promise<void>;
} {
  const filePath = join(directory, "forge-secrets.json");

  // 保存前先读取现有文件, 避免覆盖其他供应商密钥
  async function saveProviderKey(providerId: string, apiKey: string): Promise<void> {
    const secrets = await readSecretFile(filePath);
    const encryptedValue = codec.encryptString(apiKey).toString("base64");

    secrets.providerKeys[providerId] = {
      encryptedValue,
      last4: apiKey.slice(-4)
    };

    await writeSecretFile(directory, filePath, secrets);
  }

  // 读取并解密单个供应商密钥, 失败或不存在时返回 null
  async function readProviderKey(providerId: string): Promise<string | null> {
    const secrets = await readSecretFile(filePath);
    const secret = secrets.providerKeys[providerId];

    if (!secret) {
      return null;
    }

    return codec.decryptString(Buffer.from(secret.encryptedValue, "base64"));
  }

  // 只暴露是否存在和 last4, 设置页不接触完整密钥
  async function getProviderKeyStatus(providerId: string): Promise<ProviderKeyStatus> {
    const secrets = await readSecretFile(filePath);
    const secret = secrets.providerKeys[providerId];

    return secret ? { hasKey: true, last4: secret.last4 } : { hasKey: false, last4: null };
  }

  // 删除单个供应商密钥后重写密钥文件
  async function deleteProviderKey(providerId: string): Promise<void> {
    const secrets = await readSecretFile(filePath);
    delete secrets.providerKeys[providerId];
    await writeSecretFile(directory, filePath, secrets);
  }

  // 一键清理隐私数据时清空所有供应商密钥, 不保留历史 providerId 痕迹
  async function clearProviderKeys(): Promise<void> {
    await writeSecretFile(directory, filePath, { providerKeys: {} });
  }

  return {
    saveProviderKey,
    readProviderKey,
    getProviderKeyStatus,
    deleteProviderKey,
    clearProviderKeys
  };
}

// 读取密钥文件并解密 JSON, 文件不存在时返回空对象
async function readSecretFile(filePath: string): Promise<SecretFile> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const parsed = JSON.parse(rawValue) as SecretFile;
    return {
      providerKeys: parsed.providerKeys ?? {}
    };
  } catch {
    return { providerKeys: {} };
  }
}

// 把密钥对象序列化后加密写入磁盘
async function writeSecretFile(directory: string, filePath: string, secrets: SecretFile): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(secrets, null, 2), "utf8");
}
