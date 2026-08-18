import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/api-check': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-check/, '/v1beta/models/gemini-3.5-flash-lite:generateContent'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.removeHeader('sec-fetch-site');
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('origin');
          });
        }
      },
      '/api-unsplash': {
        target: 'https://unsplash.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-unsplash/, '/napi'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.removeHeader('sec-fetch-site');
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('origin');
          });
        }
      }
    }
  }
})
