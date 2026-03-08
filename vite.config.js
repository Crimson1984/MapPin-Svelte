import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite' // ⚡️ 新增：引入 v4 插件
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(), // ⚡️ 新增：激活 Tailwind 引擎
    svelte()
  ],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  }
})