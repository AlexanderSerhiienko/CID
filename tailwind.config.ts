import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Obsidian Signal design system
        background: "#0a0a0a",
        surface: "#1a1a1a",
        "surface-container": "#1d2027",
        "surface-container-low": "#191b23",
        "surface-container-high": "#272a31",
        "surface-container-highest": "#32353c",
        "surface-container-lowest": "#0b0e15",
        "surface-variant": "#32353c",
        "surface-bright": "#363941",
        "surface-tint": "#adc6ff",
        border: "#2d2d2d",
        "on-surface": "#e1e2ec",
        "on-surface-variant": "#c2c6d6",
        "inverse-surface": "#e1e2ec",
        "inverse-on-surface": "#2e3038",
        // Primary (blue)
        primary: "#3b82f6",
        "primary-dim": "#adc6ff",
        "on-primary": "#002e6a",
        "primary-container": "#4d8eff",
        "on-primary-container": "#00285d",
        // Secondary (green)
        secondary: "#4edea3",
        "on-secondary": "#003824",
        "secondary-container": "#00a572",
        "secondary-fixed": "#6ffbbe",
        "secondary-fixed-dim": "#4edea3",
        // Tertiary (amber)
        tertiary: "#ffb786",
        "on-tertiary": "#502400",
        "tertiary-container": "#df7412",
        // Error (red)
        error: "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        // Outline
        outline: "#8c909f",
        "outline-variant": "#424754",
        // Legacy shadcn compatibility aliases
        foreground: "#e1e2ec",
        card: "#1a1a1a",
        "card-foreground": "#e1e2ec",
        muted: "#272a31",
        "muted-foreground": "#c2c6d6",
        "primary-foreground": "#002e6a",
        destructive: "#ffb4ab"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px"
      }
    }
  },
  plugins: []
};

export default config;
