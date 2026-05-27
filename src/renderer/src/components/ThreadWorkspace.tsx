import type { ReactElement } from "react";
import type { Language } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import type { TaskThread } from "@/state/taskThreads";

type ThreadWorkspaceProps = {
  language: Language;
  selectedThreadId: string | null;
  threads: TaskThread[];
  onSelectThread: (threadId: string) => void;
};

export function ThreadWorkspace({
  language,
  selectedThreadId,
  threads,
  onSelectThread
}: ThreadWorkspaceProps): ReactElement {
  const { t } = useI18n(language);
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;

  if (!selectedThread) {
    return (
      <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-md border border-white/10 bg-[#15161a] p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-normal">{t("threads.emptyTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-[#a8a29a]">{t("threads.emptyBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-h-[360px] flex-1 grid-cols-[280px_1fr] overflow-hidden rounded-md border border-white/10 bg-[#15161a]">
      <aside className="border-r border-white/10 bg-[#191a1f] p-4">
        <h2 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("threads.listTitle")}</h2>
        <div className="space-y-2">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                thread.id === selectedThread.id
                  ? "bg-[#f5f4ef] text-[#222]"
                  : "bg-white/5 text-[#d7d3ca] hover:bg-white/8"
              }`}
            >
              <span className="block truncate font-medium">{thread.title}</span>
              <span className="mt-1 block text-xs opacity-70">{thread.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 p-5">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-normal text-[#a8a29a]">{t("threads.prompt")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">{selectedThread.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#d7d3ca]">
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("threads.model")}: {selectedThread.modelId}
            </span>
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("selector.intelligence")}: {selectedThread.intelligence}
            </span>
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("selector.speed")}: {selectedThread.speed}
            </span>
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("threads.status")}: {selectedThread.status}
            </span>
          </div>
        </div>

        <h2 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("threads.detailTitle")}</h2>
        <div className="space-y-2">
          {selectedThread.events.map((event) => (
            <article key={event.id} className="rounded-md border border-white/10 bg-[#1d1f24] p-3">
              <div className="mb-1 text-xs text-[#a8a29a]">{event.kind}</div>
              <p className="text-sm leading-6 text-[#f5f4ef]">{event.message}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
