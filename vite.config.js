import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite' // ⚡️ 新增：引入 v4 插件
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(), // ⚡️ 新增：激活 Tailwind 引擎
    svelte(),
    // ⚡️ 注入 PWA 引擎
    VitePWA({
      registerType: 'autoUpdate', // 当有新版本时，后台自动更新 Service Worker
      includeAssets: ['map.svg'], // 告诉 PWA 缓存哪些基础静态文件
      
      // ⚡️ Web App Manifest (应用身份证)
      manifest: {
        name: '',
        short_name: 'MapPin',
        description: 'For map notes',
        theme_color: '#ffffff', // 手机顶部状态栏的颜色
        background_color: '#f9fafb', // App 启动时的白屏背景色
        display: 'standalone', // 核心！standalone 表示隐藏浏览器地址栏，沉浸式全屏
        
        // 我们等下需要准备这两个尺寸的图标
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // 允许安卓系统对图标进行自适应裁切（比如切成圆角或水滴形）
          }
        ]
      },
      
      // ⚡️ 离线缓存策略 (Workbox)
      workbox: {
        // 自动缓存所有前端打包后的静态资源，实现二次访问的“瞬间秒开”
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  }
})