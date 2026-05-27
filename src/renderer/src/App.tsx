import type { ReactElement } from "react";

export function App(): ReactElement {
  return (
    <main className="min-h-screen bg-[#101114] text-[#f5f4ef]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <div>
          <p className="text-sm text-[#a8a29a]">Forge</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">本地 AI 开发锻造台</h1>
        </div>
      </div>
    </main>
  );
}
