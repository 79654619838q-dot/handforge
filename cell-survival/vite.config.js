import { defineConfig } from 'vite';

// На сайте HandForge игра живёт по пути /cell/ (раздаёт hub/server.js).
// В разработке комнаты командной игры берутся у локального hub (порт 8877).
export default defineConfig({
  base: '/cell/',
  server: {
    proxy: { '/cell/io': { target: 'http://localhost:8877', ws: true } },
  },
});
