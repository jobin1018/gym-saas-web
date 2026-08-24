/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#14181A", light: "#1E2426" },
        paper: "#F6F7F5",
        ember: { DEFAULT: "#E8623D", dark: "#C94F2E" },
        sage: { DEFAULT: "#4E9A6B", dark: "#3B7A53" },
        amberflag: "#D9A441",
        line: "#E4E6E1",
        muted: "#6B7370",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: { xl2: "1.1rem" },
      boxShadow: {
        card: "0 1px 2px rgba(20,24,26,0.04), 0 10px 24px -14px rgba(20,24,26,0.10)",
        "card-hover":
          "0 2px 4px rgba(20,24,26,0.05), 0 20px 32px -16px rgba(20,24,26,0.16)",
        "glow-ember": "0 8px 20px -6px rgba(232,98,61,0.45)",
        "glow-sage": "0 8px 20px -6px rgba(78,154,107,0.35)",
      },
    },
  },
  plugins: [],
};