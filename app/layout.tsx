import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { VT323 } from "next/font/google";
import ThemeToggle from "./components/ThemeToggle";
import ClientUserMenu from "./components/UserMenu";

export const metadata: Metadata = {
  title: "Oppie",
  description: "Générez des QCM (Vrai/Faux) à partir de vos PDF.",
};

const pixel = VT323({ subsets: ["latin"], weight: "400" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`text-slate-100 antialiased bg-slate-900 ${pixel.className}`}>
        <header className="sticky top-0 z-40 backdrop-blur bg-slate-900/60 border-b border-slate-800">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold text-xl tracking-wide gradient-violet">Oppie</Link>
            <nav className="flex items-center gap-4 text-slate-300 text-sm">
              <Link href="/" className="hover:text-white">Accueil</Link>
              <Link href="/quiz" className="hover:text-white">Quiz</Link>
              <Link href="/summary" className="hover:text-white">Bilan</Link>
              <Link href="/flashcards" className="hover:text-white">Flashcards</Link>
              <ThemeToggle />
              <ClientUserMenu />
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-16 border-t border-slate-800">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500">
            © {new Date().getFullYear()} Oppie — Générateur de QCM depuis PDF
          </div>
        </footer>
      </body>
    </html>
  );
}


