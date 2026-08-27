import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mfa: {
          red: "#C8102E",
          ink: "#1A1A1A",
          muted: "#696969",
          track: "#D9D9D9",
          panel: "#F2F2F2",
          white: "#FFFFFF",
        },
        rag: {
          green: "#2E7D32",
          amber: "#E8A33D",
          red: "#C8102E",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["var(--font-inter)", "Inter", "Calibri", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config
