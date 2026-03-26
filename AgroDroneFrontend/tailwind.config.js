/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",        // Scans files in root (App.tsx, main.tsx, etc.)
    "./src/**/*.{js,ts,jsx,tsx}", // Scans your components folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
