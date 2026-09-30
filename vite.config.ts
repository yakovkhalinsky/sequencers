import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the site under /sequencers/
  base: "/sequencers/",
  plugins: [react()],
});