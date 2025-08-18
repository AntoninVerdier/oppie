"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("oppie-theme")) as
      | "dark"
      | "light"
      | null;
    const prefersLight = typeof window !== "undefined" && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const initial: "dark" | "light" = stored || (prefersLight ? "light" : "dark");
    setTheme(initial);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", initial === "light");
    }
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", next === "light");
    }
    try { localStorage.setItem("oppie-theme", next); } catch {}
  }

  return (
    <button onClick={toggle} className="inline-flex items-center gap-1 text-slate-300 hover:text-white px-2 py-1 rounded border border-slate-700/60 hover:border-slate-500/60 transition-colors">
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      <span className="text-xs">{theme === "light" ? "Mode sombre" : "Mode clair"}</span>
    </button>
  );
}




