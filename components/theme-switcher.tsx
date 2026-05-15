"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const iconClassName = "text-muted-foreground";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Theme" size="icon" variant="ghost">
          {theme === "light" ? (
            <Sun key="light" className={iconClassName} />
          ) : theme === "dark" ? (
            <Moon key="dark" className={iconClassName} />
          ) : (
            <Laptop key="system" className={iconClassName} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit" align="start">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(e) => setTheme(e)}
        >
          <DropdownMenuRadioItem
            className="flex gap-2 [&>svg]:size-4"
            value="light"
          >
            <Sun className={iconClassName} />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            className="flex gap-2 [&>svg]:size-4"
            value="dark"
          >
            <Moon className={iconClassName} />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            className="flex gap-2 [&>svg]:size-4"
            value="system"
          >
            <Laptop className={iconClassName} />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
