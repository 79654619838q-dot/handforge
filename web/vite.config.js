import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Ассеты собранной сборки (assets/, favicon и т.п.) отдаются хабом
  // с корня сайта, а не из-под /quest — поэтому base оставляем "/" по
  // умолчанию; префикс /quest нужен только для маршрутов React Router
  // (см. basename в main.jsx), не для ссылок на статику.
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 — доступ с телефона по локальной сети
    port: 5173,
    allowedHosts: true, // разрешить обращения через туннель (ngrok/localtunnel меняют хост)
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
