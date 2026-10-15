import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("theme");
    return saved === "dark" ? "dark" : "light";
  });

  // Load saved theme from DB on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bank_settings")
        .select("theme")
        .eq("id", "default")
        .maybeSingle();
      const dbTheme = (data as any)?.theme as Theme | undefined;
      if (dbTheme === "dark" || dbTheme === "light") {
        setTheme(dbTheme);
      }
    })();
  }, []);

  // Apply theme + persist
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = async () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    await supabase
      .from("bank_settings")
      .update({ theme: next } as any)
      .eq("id", "default");
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
