// 本文件说明: 渲染 App 级命令状态弹窗和反馈弹窗
import type { ReactElement } from "react";
import { useState } from "react";
import type { Language } from "@shared/modelTypes";
import {
  getFeedbackDialogCopy,
  type CommandDialogState
} from "@/components/appDialogModels";

export function CommandDialog({
  dialog,
  language,
  onClose
}: {
  dialog: CommandDialogState;
  language: Language;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 px-6">
      <div className="w-full max-w-[520px] rounded-[22px] border border-[#ececf1] bg-white p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <span className="min-w-0">
            <h2 className="text-[20px] font-semibold text-[#202123]">{dialog.title}</h2>
            <p className="mt-1 text-[12px] leading-5 text-[#6e6e80]">{dialog.description}</p>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#565869] transition hover:bg-[#f7f7f8] hover:text-[#202123]"
            aria-label={language === "zh-CN" ? "关闭" : "Close"}
          >
            ×
          </button>
        </div>
        <div className="space-y-2">
          {dialog.rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 rounded-[12px] bg-[#f7f7f8] px-3 py-2.5 text-[12px]"
            >
              <span className="text-[#6e6e80]">{row.label}</span>
              <span className="min-w-0 break-words text-[#202123]">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FeedbackDialog({
  language,
  onClose,
  onSubmit
}: {
  language: Language;
  onClose: () => void;
  onSubmit: (category: string, detail: string, includeStatus: boolean) => void;
}): ReactElement {
  const [category, setCategory] = useState(language === "zh-CN" ? "错误" : "Bug");
  const [detail, setDetail] = useState("");
  const [includeStatus, setIncludeStatus] = useState(true);
  const copy = getFeedbackDialogCopy(language);
  const canSubmit = detail.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 px-6">
      <div className="w-full max-w-[860px] rounded-[22px] border border-[#ececf1] bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-[24px] font-semibold text-[#202123]">{copy.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#565869] transition hover:bg-[#f7f7f8] hover:text-[#202123]"
            aria-label={copy.close}
          >
            ×
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          {copy.categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`h-11 rounded-full border px-5 text-[14px] transition ${
                category === item
                  ? "border-[#202123] bg-[#202123] text-white"
                  : "border-[#d9d9e3] bg-white text-[#202123] hover:bg-[#f7f7f8]"
              }`}
            >
              + {item}
            </button>
          ))}
        </div>
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.currentTarget.value)}
          placeholder={copy.placeholder}
          className="h-44 w-full resize-none rounded-[18px] border border-[#2563eb] bg-white px-4 py-3 text-[15px] leading-6 text-[#202123] outline-none placeholder:text-[#8e8ea0]"
        />
        <label className="mt-4 flex items-center gap-2 text-[14px] text-[#6e6e80]">
          <input
            type="checkbox"
            checked={includeStatus}
            onChange={(event) => setIncludeStatus(event.currentTarget.checked)}
            className="h-4 w-4 rounded border-[#d9d9e3]"
          />
          {copy.includeStatus}
        </label>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(category, detail, includeStatus)}
          className="mt-6 h-12 w-full rounded-[14px] bg-[#202123] text-[15px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#a3a3a3]"
        >
          {copy.submit}
        </button>
      </div>
    </div>
  );
}
