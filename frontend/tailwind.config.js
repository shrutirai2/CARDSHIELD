/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        navy: "#07090f",
      },
      backdropBlur: {
        xl: "20px",
      },
      keyframes: {
        riseIn: {
          "0%":   { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        expandBar: {
          "0%": { width: "0" },
        },
      },
      animation: {
        "rise-in":    "riseIn .45s cubic-bezier(.22,1,.36,1) both",
        "expand-bar": "expandBar .9s cubic-bezier(.22,1,.36,1) both",
      },
    },
  },
  plugins: [],
};