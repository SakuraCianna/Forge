// 本文件说明: 本地开发 QA 沙箱配置, 不作为普通用户的默认项目路径
export type DevelopmentQaSandboxProject = {
  kind: "development-qa-sandbox";
  path: string | null;
  modelId: string;
};

export const developmentQaSandboxProject: DevelopmentQaSandboxProject = {
  kind: "development-qa-sandbox",
  path: null,
  modelId: "mimo-v2.5-pro"
};

export function getProductionDefaultProjectPath(): string | null {
  return null;
}
