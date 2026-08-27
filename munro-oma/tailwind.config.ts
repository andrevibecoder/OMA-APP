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
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["var(--font-inter)", "Inter", "Calibri", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config
