import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" : fonctionne sur GitHub Pages quel que soit le nom du dépôt
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
