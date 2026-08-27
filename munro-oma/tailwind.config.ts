import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mfa: {
          red: "#BA0C2F",
          black: "#101820",
          ink: "#101820",
          muted: "#53565A",
          track: "#DCDDDD",
          panel: "#F2F2F2",
          white: "#FFFFFF",
        },
        rag: {
          green: "#2E7D32",
          amber: "#E8A33D",
          red: "#BA0C2F",
        },
      },
      fontFamily: {
        // Open Sans only (Brand Guide p.10); Calibri is the sanctioned digital fallback (p.12).
        sans: ["var(--font-open-sans)", "Open Sans", "Calibri", "system-ui", "sans-serif"],
        serif: ["var(--font-open-sans)", "Open Sans", "Calibri", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config
