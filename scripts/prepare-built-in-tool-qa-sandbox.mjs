// 本文件说明: 准备 Built-in Tools QA 使用的受控项目沙箱, 并在 GitHub Actions 中导出项目根路径
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function prepareBuiltInToolQaSandbox() {
  const projectRoot = resolve(".tmp-test", "quality-gate-sandbox");
  const sourceRoot = join(projectRoot, "src");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name: "forge-v0-3-quality-gate-sandbox",
        scripts: {
          build: "node -e \"console.log('Forge quality gate build')\"",
          lint: "node -e \"console.log('Forge quality gate lint')\"",
          test: "node -e \"console.log('Forge quality gate test')\"",
          typecheck: "tsc --noEmit"
        },
        devDependencies: {
          typescript: "^6.0.3"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022"
        },
        include: ["src/**/*.ts"]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    join(sourceRoot, "index.ts"),
    "export function hello(name: string): string {\n  return `hello ${name}`;\n}\n",
    "utf8"
  );

  return projectRoot;
}

async function exportGitHubActionsEnvironment(projectRoot) {
  if (!process.env.GITHUB_ENV) {
    return false;
  }

  await appendFile(process.env.GITHUB_ENV, `FORGE_QA_PROJECT_ROOT=${projectRoot}\n`, "utf8");
  return true;
}

function isCliEntrypoint() {
  return Boolean(
    process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  );
}

if (isCliEntrypoint()) {
  const projectRoot = await prepareBuiltInToolQaSandbox();
  const exportedToGitHubEnv = await exportGitHubActionsEnvironment(projectRoot);

  console.log(
    JSON.stringify(
      {
        projectRoot,
        exportedToGitHubEnv
      },
      null,
      2
    )
  );
}
