/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#3b82f6", dark: "#1d4ed8" },
        surface: { DEFAULT: "#111827", raised: "#1f2937", border: "#374151" },
      },
    },
  },
  plugins: [],
};
