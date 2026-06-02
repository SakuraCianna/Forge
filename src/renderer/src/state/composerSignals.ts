// 本文件说明: 管理统一输入框的聚焦和外部提交信号
import { useCallback, useState } from "react";

export type ComposerSignals = {
  focusSignal: number;
  submitSignal: number;
  focusComposer: () => void;
  submitComposer: () => void;
};

export function useComposerSignals(): ComposerSignals {
  const [focusSignal, setFocusSignal] = useState(0);
  const [submitSignal, setSubmitSignal] = useState(0);

  const focusComposer = useCallback(() => {
    setFocusSignal((current) => current + 1);
    setSubmitSignal(0);
  }, []);

  const submitComposer = useCallback(() => {
    setSubmitSignal((current) => current + 1);
  }, []);

  return {
    focusSignal,
    submitSignal,
    focusComposer,
    submitComposer
  };
}
