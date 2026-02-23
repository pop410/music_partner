import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Panel from './设置界面.vue'; // 假设您的 Vue 组件位于此路径

// 创建 Vue 应用实例
const app = createApp(Panel);

// 创建并使用 Pinia
const pinia = createPinia();
app.use(pinia);

// 在 DOM 加载完成后挂载 Vue 应用
$(() => {
  const $app = $('<div id="netease-music-plugin"></div>').appendTo('#extensions_settings');
  app.mount($app[0]);
});

// 在页面卸载时卸载 Vue 应用
$(window).on('pagehide', () => {
  app.unmount();
});

// 导入其他模块
import './music_companion';