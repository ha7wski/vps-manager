/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark UI palette used across the app.
        panel: "#252526",
        sidebar: "#1e1e1e",
        accent: "#0e639c",
      },
    },
  },
  plugins: [],
};
