import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";

type StudyAppShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  userEmail?: string | null;
};

export function StudyAppShell({
  actions,
  children,
  userEmail,
}: StudyAppShellProps) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="shrink-0 text-base font-semibold tracking-wide"
            >
              VocabSAT
            </Link>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Today Session
            </Badge>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {actions}
            {userEmail ? (
              <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:block">
                {userEmail}
              </span>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
