// 本文件说明: 渲染模型供应商图标和兜底字母标记
import type { CSSProperties, ReactElement } from "react";
import type { ForgeProvider } from "@shared/modelTypes";

const providerIconUrls: Record<string, string> = {
  anthropic: new URL("../assets/provider-icons/anthropic.svg", import.meta.url).href,
  baidu: new URL("../assets/provider-icons/baidu.svg", import.meta.url).href,
  deepseek: new URL("../assets/provider-icons/deepseek.svg", import.meta.url).href,
  gemini: new URL("../assets/provider-icons/gemini.svg", import.meta.url).href,
  "github-copilot": new URL("../assets/provider-icons/github-copilot.svg", import.meta.url).href,
  hunyuan: new URL("../assets/provider-icons/hunyuan.svg", import.meta.url).href,
  minimax: new URL("../assets/provider-icons/minimax.svg", import.meta.url).href,
  modelscope: new URL("../assets/provider-icons/modelscope.svg", import.meta.url).href,
  moonshot: new URL("../assets/provider-icons/moonshot.svg", import.meta.url).href,
  ollama: new URL("../assets/provider-icons/ollama.svg", import.meta.url).href,
  openai: new URL("../assets/provider-icons/openai.svg", import.meta.url).href,
  openrouter: new URL("../assets/provider-icons/openrouter.svg", import.meta.url).href,
  groq: new URL("../assets/provider-icons/groq.svg", import.meta.url).href,
  together: new URL("../assets/provider-icons/together.svg", import.meta.url).href,
  mistral: new URL("../assets/provider-icons/mistral.svg", import.meta.url).href,
  xai: new URL("../assets/provider-icons/xai.svg", import.meta.url).href,
  fireworks: new URL("../assets/provider-icons/fireworks.svg", import.meta.url).href,
  cerebras: new URL("../assets/provider-icons/cerebras.svg", import.meta.url).href,
  qwen: new URL("../assets/provider-icons/qwen.svg", import.meta.url).href,
  siliconflow: new URL("../assets/provider-icons/siliconflow.svg", import.meta.url).href,
  stepfun: new URL("../assets/provider-icons/stepfun.svg", import.meta.url).href,
  volcengine: new URL("../assets/provider-icons/volcengine.svg", import.meta.url).href,
  xiaomi: new URL("../assets/provider-icons/xiaomi.svg", import.meta.url).href,
  zhipu: new URL("../assets/provider-icons/zhipu.svg", import.meta.url).href
};

const sizeClassNames = {
  xs: "h-5 w-5 p-[2px] text-[8px]",
  sm: "h-6 w-6 p-[2px] text-[9px]",
  md: "h-7 w-7 p-[2px] text-[10px]",
  lg: "h-8 w-8 p-[2px] text-[11px]"
} as const;

// 优先使用内置图标, 没有图标时显示供应商首字母
export function ProviderMark({
  fallbackLabel,
  provider,
  size = "md"
}: {
  fallbackLabel: string;
  provider: ForgeProvider | null;
  size?: keyof typeof sizeClassNames;
}): ReactElement {
  const accentColor = provider?.accentColor ?? "#6e6e80";
  const icon = provider?.icon ?? getProviderInitials(fallbackLabel);
  const iconUrl = provider?.iconAsset ? providerIconUrls[provider.iconAsset] : undefined;
  const style = {
    color: accentColor,
    borderColor: `${accentColor}66`
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      style={style}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white font-bold leading-none tracking-normal shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${sizeClassNames[size]}`}
    >
      {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-contain" /> : icon}
    </span>
  );
}

// 从供应商名称提取最多两个首字母
function getProviderInitials(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "API";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}
