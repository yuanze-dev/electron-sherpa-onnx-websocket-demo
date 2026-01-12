import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  server: {
    proxy: {
      // 代理整个编辑器目录下的所有路径
      '/editor/1.1.0-dev.6': {
        target: 'https://dev-tcq.lusun.cn',
        changeOrigin: true,
        secure: true,
      },
      // 也添加备用代理路径
      '**/assets/**': {
        target: 'https://dev-tcq.lusun.cn',
        changeOrigin: true,
        secure: true,
      }
    }
  }
});
