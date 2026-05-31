import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes resolves the active theme on the client; wait for mount so the
  // icon matches what's actually rendered instead of flashing the wrong one.
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && isDark ? (
        // Key on the icon so the swap spins + fades in — a small reward for toggling.
        <Sun
          key="sun"
          className="h-4 w-4 motion-safe:animate-in motion-safe:fade-in motion-safe:spin-in-90 motion-safe:duration-300"
          aria-hidden="true"
        />
      ) : (
        <Moon
          key="moon"
          className={cn(
            "h-4 w-4",
            mounted
              ? "motion-safe:animate-in motion-safe:fade-in motion-safe:spin-in-90 motion-safe:duration-300"
              : "opacity-0"
          )}
          aria-hidden="true"
        />
      )}
    </Button>
  );
}
