"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [message, setMessage] = useState("Confirming your account...");

  useEffect(() => {
    async function confirmAuth() {
      const authError =
        searchParams.get("error_description") ?? searchParams.get("error");
      const code = searchParams.get("code");
      const next = getSafeNextPath(searchParams.get("next"));
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") as EmailOtpType | null;

      if (authError) {
        router.replace(`/auth/error?error=${encodeURIComponent(authError)}`);
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace(`/auth/error?error=${encodeURIComponent(error.message)}`);
          return;
        }

        router.replace(next);
        return;
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });

        if (error) {
          router.replace(`/auth/error?error=${encodeURIComponent(error.message)}`);
          return;
        }

        router.replace(next);
        return;
      }

      setMessage("This confirmation link is missing an auth code.");
    }

    void confirmAuth();
  }, [router, searchParams, supabase]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Confirming</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-2 w-full" />
      </CardContent>
    </Card>
  );
}

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <ConfirmContent />
        </Suspense>
      </div>
    </div>
  );
}

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }

  return next;
}
