import { defineConfig } from 'vite';

// На сайте HandForge игра живёт по пути /cell/ (раздаёт hub/server.js).
export default defineConfig({
  base: '/cell/',
});
