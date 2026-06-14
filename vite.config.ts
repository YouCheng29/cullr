import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA — deploys to any static host (GitHub Pages / Cloudflare Pages).
// No backend: every byte stays in the browser (privacy is the product).
export default defineConfig({ plugins: [react()], base: "./" });
