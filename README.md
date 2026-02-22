# Netease-Music-Partner
网易云音乐实时同步插件 for SillyTavern  
悬浮球 / 歌词注入 / AI prompt 联动 / IndexedDB 缓存

## 安装
1. 下载 `dist/music-tavern-plugin/index.js`
2. 放入 ST `data/extensions` 并在启动器勾选“netease-music”
3. 打开网易云网页版 → 悬浮球自动出现

## 开发
```bash
pnpm i
pnpm run build
pnpm watch
```

## 免责声明
本插件通过网易云网页版**非公开**接口获取播放状态，仅供学习研究；  
请勿高频轮询或商用，否则后果自负。
