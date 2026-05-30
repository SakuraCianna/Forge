// 本文件说明: 渲染统一样式的下拉选择菜单, 避免原生方形 select
import type { ReactElement } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

type InlineSelectMenuProps<T extends string> = {
  align?: "start" | "center" | "end";
  ariaLabel: string;
  contentClassName?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  triggerClassName?: string;
  value: T;
};

// 统一所有轻量下拉框的圆角和动画, 避免回退到系统原生菜单
export function InlineSelectMenu<T extends string>({
  align = "end",
  ariaLabel,
  contentClassName,
  disabled = false,
  onChange,
  options,
  triggerClassName,
  value
}: InlineSelectMenuProps<T>): ReactElement {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={joinClassNames(
            "inline-flex h-9 min-w-32 items-center justify-between gap-3 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition-colors hover:bg-[#f7f7f8] focus:border-[#202123] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#f7f7f8] disabled:text-[#8e8ea0]",
            triggerClassName
          )}
        >
          <span className="truncate">{selected?.label ?? ""}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6e6e80]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={joinClassNames(
            "forge-dropdown-content forge-dropdown-fast z-50 min-w-40 rounded-[16px] border border-[#ececf1] bg-white p-1.5 text-sm text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]",
            contentClassName
          )}
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="flex h-9 cursor-default select-none items-center justify-between gap-3 rounded-[10px] px-2.5 outline-none transition-colors data-[highlighted]:bg-[#f7f7f8]"
            >
              <span>{option.label}</span>
              {option.value === value ? <Check className="h-4 w-4" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// 合并可选 className, 让菜单组件调用处保持干净
function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
