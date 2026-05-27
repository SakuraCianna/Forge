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

export function createKeyVault({ directory, codec }: KeyVaultOptions): {
  saveProviderKey: (providerId: string, apiKey: string) => Promise<void>;
  readProviderKey: (providerId: string) => Promise<string | null>;
  getProviderKeyStatus: (providerId: string) => Promise<ProviderKeyStatus>;
  deleteProviderKey: (providerId: string) => Promise<void>;
} {
  const filePath = join(directory, "forge-secrets.json");

  async function saveProviderKey(providerId: string, apiKey: string): Promise<void> {
    const secrets = await readSecretFile(filePath);
    const encryptedValue = codec.encryptString(apiKey).toString("base64");

    secrets.providerKeys[providerId] = {
      encryptedValue,
      last4: apiKey.slice(-4)
    };

    await writeSecretFile(directory, filePath, secrets);
  }

  async function readProviderKey(providerId: string): Promise<string | null> {
    const secrets = await readSecretFile(filePath);
    const secret = secrets.providerKeys[providerId];

    if (!secret) {
      return null;
    }

    return codec.decryptString(Buffer.from(secret.encryptedValue, "base64"));
  }

  async function getProviderKeyStatus(providerId: string): Promise<ProviderKeyStatus> {
    const secrets = await readSecretFile(filePath);
    const secret = secrets.providerKeys[providerId];

    return secret ? { hasKey: true, last4: secret.last4 } : { hasKey: false, last4: null };
  }

  async function deleteProviderKey(providerId: string): Promise<void> {
    const secrets = await readSecretFile(filePath);
    delete secrets.providerKeys[providerId];
    await writeSecretFile(directory, filePath, secrets);
  }

  return {
    saveProviderKey,
    readProviderKey,
    getProviderKeyStatus,
    deleteProviderKey
  };
}

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

async function writeSecretFile(directory: string, filePath: string, secrets: SecretFile): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(secrets, null, 2), "utf8");
}
