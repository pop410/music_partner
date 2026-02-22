<template>
  <div class="netease-music-extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ `网易云音乐` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="netease-music-extension_block flex-container">
          <p class="description">{{ `网易云音乐同步插件设置` }}</p>
        </div>

        <div class="netease-music-extension_block flex-container">
          <input v-model="settings.showInExtensionGroup" type="checkbox" />
          <label for="showInExtensionGroup">{{ `在插件组中显示` }}</label>
        </div>

        <div class="netease-music-extension_block flex-container">
          <input v-model="settings.enableFloatingBall" type="checkbox" @change="handleFloatingBallToggle" />
          <label for="enableFloatingBall">{{ `启用悬浮球模式` }}</label>
          <small class="hint">{{ `启用后插件将从插件组移动到悬浮球显示` }}</small>
        </div>

        <div class="netease-music-extension_block flex-container">
          <input v-model="settings.showStatusBar" type="checkbox" />
          <label for="showStatusBar">{{ `显示底部状态栏` }}</label>
        </div>

        <div class="netease-music-extension_block flex-container">
          <input v-model="settings.enableImageCache" type="checkbox" />
          <label for="enableImageCache">{{ `启用图片缓存` }}</label>
          <small class="hint">{{ `将歌曲封面缓存到本地temp文件夹` }}</small>
        </div>

        <div class="netease-music-extension_block flex-container">
          <label for="syncInterval">{{ `同步频率 (秒)` }}</label>
          <input v-model="settings.syncInterval" type="number" min="1" max="60" step="1" />
        </div>

        <div class="netease-music-extension_block flex-container">
          <div class="status-info">
            <span>{{ `Cookie状态: ` }}</span>
            <span :class="{'status-set': settings.cookieSet, 'status-not-set': !settings.cookieSet}">
              {{ settings.cookieSet ? '已设置' : '未设置' }}
            </span>
          </div>
          <button class="menu_button" @click="handleSetCookie">
            {{ settings.cookieSet ? '重新设置Cookie' : '设置Cookie' }}
          </button>
        </div>

        <hr class="sysHR" />
        
        <div class="netease-music-extension_block flex-container">
          <button class="menu_button" @click="handleRefreshSync">
            {{ `立即同步当前播放状态` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useSettingsStore } from './settings';

const { settings } = storeToRefs(useSettingsStore());

const handleFloatingBallToggle = () => {
  if (settings.value.enableFloatingBall) {
    toastr.info('已启用悬浮球模式，插件将显示为悬浮球');
    // 这里需要触发悬浮球组件的创建
    if (window.NeteaseMusicPlugin) {
      window.NeteaseMusicPlugin.createFloatingBall();
    }
  } else {
    toastr.info('已关闭悬浮球模式，插件将在插件组中显示');
    // 这里需要隐藏悬浮球
    if (window.NeteaseMusicPlugin) {
      window.NeteaseMusicPlugin.hideFloatingBall();
    }
  }
};

const handleSetCookie = () => {
  // 触发Cookie设置弹窗
  if (window.NeteaseMusicPlugin && window.NeteaseMusicPlugin.showCookiePopup) {
    window.NeteaseMusicPlugin.showCookiePopup();
  } else {
    // 备用方案
    const cookie = prompt('请输入网易云Cookie：');
    if (cookie) {
      if (window.MusicApi) {
        window.MusicApi.setCookie(cookie);
        settings.value.cookieSet = true;
        toastr.success('Cookie已设置');
      }
    }
  }
};

const handleRefreshSync = () => {
  if (window.PlayerState && window.PlayerState.startPolling) {
    window.PlayerState.startPolling();
    toastr.success('正在同步当前播放状态...');
  }
};
</script>

<style scoped>
.netease-music-extension-settings {
  margin: 10px 0;
}

.netease-music-extension_block {
  margin: 12px 0;
  padding: 8px 0;
}

.description {
  font-size: 14px;
  color: #666;
  margin-bottom: 16px;
}

.hint {
  font-size: 12px;
  color: #888;
  margin-left: 8px;
  font-style: italic;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 16px;
}

.status-set {
  color: #4caf50;
  font-weight: bold;
}

.status-not-set {
  color: #f44336;
  font-weight: bold;
}

.menu_button {
  padding: 6px 12px;
  background-color: #4285f4;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.menu_button:hover {
  background-color: #3367d6;
}
</style>