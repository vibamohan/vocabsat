import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";

type StudyAppShellProps = {
  actions?: ReactNode;
  children: ReactNode;
};

export function StudyAppShell({ actions, children }: StudyAppShellProps) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="shrink-0 text-base font-semibold tracking-wide"
            >
              VocabSAT
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <nav className="hidden items-center gap-3 text-sm text-muted-foreground sm:flex">
              <Link href="/words">Words</Link>
              <Link href="/write">Write</Link>
              <Link href="/passages">Passages</Link>
              <Link href="/progress">Progress</Link>
            </nav>
            {actions}
            <LogoutButton aria-label="Sign out" size="icon">
              {null}
            </LogoutButton>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
