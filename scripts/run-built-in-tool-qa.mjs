// 本文件说明: 从命令行运行开发 Built-in Tools QA, 复用编译后的测试产物
import { createDefaultBuiltInToolExecutors } from "../.tmp-test/src/main/builtInTools/builtInToolExecutors.js";
import { runDevelopmentBuiltInToolQa } from "../.tmp-test/src/main/builtInTools/builtInToolQaRunner.js";
import { createBuiltInToolRegistry } from "../.tmp-test/src/main/builtInTools/builtInToolRegistry.js";

const registry = createBuiltInToolRegistry({
  executors: createDefaultBuiltInToolExecutors()
});
const result = await runDevelopmentBuiltInToolQa({
  registry,
  request: {
    browserPreviewUrl: process.env.FORGE_QA_BROWSER_PREVIEW_URL,
    includeBrowserChecks: process.env.FORGE_QA_BROWSER_CHECKS !== "false",
    includeMutationChecks: process.env.FORGE_QA_MUTATION_CHECKS !== "false",
    includeWebChecks: process.env.FORGE_QA_WEB_CHECKS === "true",
    projectRoot: process.env.FORGE_QA_PROJECT_ROOT,
    modelId: process.env.FORGE_QA_MODEL_ID
  }
});

console.log(JSON.stringify(result, null, 2));

if (result.status === "failed") {
  process.exitCode = 1;
}
