"use client";

import { createClient } from "@/lib/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = Omit<ButtonProps, "onClick" | "type">;

export function LogoutButton({
  children = "Sign out",
  variant = "outline",
  size = "sm",
  ...props
}: LogoutButtonProps) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <Button
      onClick={logout}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      <LogOut data-icon="inline-start" />
      {children}
    </Button>
  );
}
