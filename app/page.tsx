"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function routeUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      router.replace(user ? "/dashboard" : "/auth/login");
    }

    void routeUser();
  }, [router, supabase]);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Skeleton className="h-10 w-52" />
    </main>
  );
}
