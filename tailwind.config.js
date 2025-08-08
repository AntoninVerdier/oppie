/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    "bg-gradient-to-b",
    "from-mint-900",
    "to-transparent",
    "backdrop-blur",
    "rounded-xl",
    "rounded-2xl",
    "border",
    "border-slate-700",
    "border-mint-200",
    "shadow-sm",
    "text-slate-100",
    "text-slate-300",
    "text-slate-400",
    "text-slate-500",
    "text-mint-800",
    "bg-slate-900",
    "bg-slate-900/70",
    "bg-emerald-50",
    "bg-rose-50",
    "border-emerald-200",
    "border-rose-200",
    "bg-mint-600",
    "hover:bg-mint-700",
  ],
  theme: {
    extend: {
      colors: {
        // Re-map our brand color token to a violet palette
        mint: {
          50: "#f7f5ff",
          100: "#eee9ff",
          200: "#dbceff",
          300: "#c0aaff",
          400: "#a07dff",
          500: "#865dff",
          600: "#6d46e8",
          700: "#5838c2",
          800: "#432b95",
          900: "#2f226b"
        }
      }
    }
  },
  plugins: []
};


