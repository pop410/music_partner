
// ------------------------------------------------------------------------------------------------
// 1. 类型定义与 API 封装 (MusicApi)
// ------------------------------------------------------------------------------------------------



interface SongInfo {
  id: number;
  name: string;
  artist: string;
  coverUrl: string;
  duration: number; // 毫秒
  lrc?: string; // 原始内容
  lrcLines?: LyricLine[]; // 解析后的行
}

interface LyricLine {
  time: number; // 毫秒
  text: string;
}

// 缓存接口
interface MusicCacheData {
  lyrics: { [id: number]: string };
  images: { [id: number]: string };
  lastUpdated: number;
}

const CACHE_KEY = 'music_companion_cache';

const MusicCache = {
  data: {
    lyrics: {},
    images: {},
    lastUpdated: Date.now()
  } as MusicCacheData,

  load() {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      try {
        this.data = JSON.parse(stored);
      } catch (e) {
        console.error('[Music] Cache load failed', e);
      }
    }
  },

  save() {
    this.data.lastUpdated = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(this.data));
  },

  getLyric(id: number): string | undefined {
    return this.data.lyrics[id];
  },

  setLyric(id: number, content: string) {
    this.data.lyrics[id] = content;
    this.save();
  },
  
  getImage(id: number): string | undefined {
    return this.data.images[id];
  },

  setImage(id: number, url: string) {
    this.data.images[id] = url;
    this.save();
  }
};

// ------------------------------------------------------------------------------------------------
// 2.1 图片缓存管理器 (IndexedDB)
// ------------------------------------------------------------------------------------------------

const ImageCache = {
  db: null as IDBDatabase | null,
  enabled: true,
  
  // 检查是否支持 IndexedDB
  supportsIndexedDB(): boolean {
    return 'indexedDB' in window;
  },
  
  // 初始化数据库
  async init(): Promise<boolean> {
    if (!this.supportsIndexedDB()) {
      console.warn('[Music] IndexedDB not supported, image cache disabled');
      this.enabled = false;
      return false;
    }
    
    return new Promise((resolve) => {
      const request = indexedDB.open('netease-music-images', 1);
      
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('images')) {
          const store = db.createObjectStore('images', { keyPath: 'songId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      
      request.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        this.enabled = true;
        console.log('[Music] Image cache initialized');
        resolve(true);
      };
      
      request.onerror = (e) => {
        console.error('[Music] Failed to initialize image cache', e);
        this.enabled = false;
        resolve(false);
      };
    });
  },
  
  // 保存图片到缓存
  async saveImage(songId: number, imageBlob: Blob): Promise<boolean> {
    if (!this.enabled || !this.db) {
      console.warn('[Music] Image cache disabled or not initialized');
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const record = {
          songId,
          image: imageBlob,
          timestamp: Date.now(),
          size: imageBlob.size
        };
        const request = store.put(record);
        
        request.onsuccess = () => {
          console.log(`[Music] Image cached for song ${songId}, size: ${imageBlob.size} bytes`);
          resolve(true);
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to cache image', e);
          resolve(false);
        };
      } catch (error) {
        console.error('[Music] Error saving image to cache', error);
        resolve(false);
      }
    });
  },
  
  // 从缓存获取图片
  async getImage(songId: number): Promise<Blob | null> {
    if (!this.enabled || !this.db) {
      return null;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(songId);
        
        request.onsuccess = () => {
          const result = request.result;
          if (result && result.image instanceof Blob) {
            console.log(`[Music] Image cache hit for song ${songId}`);
            resolve(result.image);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to retrieve image from cache', e);
          resolve(null);
        };
      } catch (error) {
        console.error('[Music] Error retrieving image from cache', error);
        resolve(null);
      }
    });
  },
  
  // 检查图片是否在缓存中
  async hasImage(songId: number): Promise<boolean> {
    if (!this.enabled || !this.db) {
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(songId);
        
        request.onsuccess = () => {
          resolve(!!request.result);
        };
        
        request.onerror = () => {
          resolve(false);
        };
      } catch (error) {
        resolve(false);
      }
    });
  },
  
  // 清理过期缓存（超过30天）
  async cleanup(expiryDays: number = 30): Promise<number> {
    if (!this.enabled || !this.db) {
      return 0;
    }
    
    return new Promise((resolve) => {
      try {
        const expiryTime = Date.now() - (expiryDays * 24 * 60 * 60 * 1000);
        const transaction = this.db!.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(expiryTime);
        const request = index.openCursor(range);
        let deletedCount = 0;
        
        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            console.log(`[Music] Cleaned ${deletedCount} expired images from cache`);
            resolve(deletedCount);
          }
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to cleanup cache', e);
          resolve(0);
        };
      } catch (error) {
        console.error('[Music] Error cleaning up cache', error);
        resolve(0);
      }
    });
  },
  
  // 获取缓存大小（字节）
  async getCacheSize(): Promise<number> {
    if (!this.enabled || !this.db) {
      return 0;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        let totalSize = 0;
        
        const request = store.openCursor();
        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor) {
            const record = cursor.value;
            totalSize += record.size || 0;
            cursor.continue();
          } else {
            resolve(totalSize);
          }
        };
        
        request.onerror = () => {
          resolve(0);
        };
      } catch (error) {
        resolve(0);
      }
    });
  },
  
  // 清除所有缓存
  async clearAll(): Promise<boolean> {
    if (!this.enabled || !this.db) {
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const request = store.clear();
        
        request.onsuccess = () => {
          console.log('[Music] Image cache cleared');
          resolve(true);
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to clear cache', e);
          resolve(false);
        };
      } catch (error) {
        console.error('[Music] Error clearing cache', error);
        resolve(false);
      }
    });
  }
};

// 网易云 API 客户端 (连接本地 Bridge)
const MusicApi = {
  baseUrl: 'http://localhost:3000', // 默认连接本地桥接服务
  cookie: '', // 用户 Cookie，可通过设置界面或命令输入

  async request(endpoint: string, data: any = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...data, cookie: this.cookie })
      });
      return await response.json();
    } catch (e) {
      console.error(`[Music] API Error ${endpoint}`, e);
      toastr.error(`连接音乐服务失败: ${endpoint}`);
      return null;
    }
  },

  // 搜索歌曲
  async search(keyword: string): Promise<SongInfo | null> {
    const res = await this.request('/search', { keywords: keyword, limit: 1 });
    if (res && res.result && res.result.songs && res.result.songs.length > 0) {
      const song = res.result.songs[0];
      return {
        id: song.id,
        name: song.name,
        artist: song.ar.map((a: any) => a.name).join('/'),
        coverUrl: song.al.picUrl,
        duration: song.dt,
      };
    }
    return null;
  },

  // 获取歌词
  async getLyric(id: number): Promise<string> {
    // 检查缓存
    const cached = MusicCache.getLyric(id);
    if (cached) {
      console.log(`[Music] 使用缓存歌词: ${id}`);
      return cached;
    }

    const res = await this.request('/lyric', { id });
    if (res && res.lrc && res.lrc.lyric) {
      const lrc = res.lrc.lyric;
      MusicCache.setLyric(id, lrc); // 存入缓存
      return lrc;
    }
    return "[00:00.00] 暂无歌词";
  },

  // 获取 MP3 URL
  async getSongUrl(id: number): Promise<string | null> {
    const res = await this.request('/url', { id });
    if (res && res.data && res.data[0] && res.data[0].url) {
      return res.data[0].url;
    }
    return null; // 或者返回官方链接尝试直接播放
  },
  
  // 设置 Cookie
  setCookie(cookie: string) {
    this.cookie = cookie;
    toastr.success('网易云 Cookie 已设置');
  },

  // 获取当前播放状态（来自 Windows 媒体控制）
  async getCurrentPlayback(): Promise<{
    isPlaying: boolean;
    title?: string;
    artist?: string;
    album?: string;
    neteaseId?: number;
    duration?: number;
    coverUrl?: string;
  } | null> {
    const res = await this.request('/current');
    if (res && !res.error) {
      return res;
    }
    return null;
  }
};

// ------------------------------------------------------------------------------------------------
// 2. 歌词解析器 (LyricParser)
// ------------------------------------------------------------------------------------------------

const LyricParser = {
  parse(lrc: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
    
    lrc.split('\n').forEach(line => {
      line = line.trim();
      const match = line.match(regex);
      if (match) {
        const min = parseInt(match[1]);
        const sec = parseInt(match[2]);
        const ms = parseInt(match[3]) * (match[3].length === 2 ? 10 : 1);
        const text = match[4].trim();
        if (text) {
          lines.push({
            time: min * 60000 + sec * 1000 + ms,
            text: text
          });
        }
      }
    });
    return lines.sort((a, b) => a.time - b.time);
  },

  // 获取当前时间点的歌词切片
  getSlice(lines: LyricLine[], currentTime: number, bufferMs: number = 3000) {
    const pastAndNow: LyricLine[] = [];
    const nearFuture: LyricLine[] = [];

    for (const line of lines) {
      if (line.time <= currentTime) {
        pastAndNow.push(line);
      } else if (line.time <= currentTime + bufferMs) {
        nearFuture.push(line);
      } else {
        break; // 后面的不需要了
      }
    }
    
    // pastAndNow 只取最近的 5 行，避免 token 爆炸
    const recentPast = pastAndNow.slice(-5);
    
    return { recentPast, nearFuture };
  }
};

// ------------------------------------------------------------------------------------------------
// 3. 播放器状态管理 (PlayerState)
// ------------------------------------------------------------------------------------------------

const PlayerState = {
  currentSong: null as SongInfo | null,
  isPlaying: false,
  currentTime: 0, // 毫秒
  audioElement: null as HTMLAudioElement | null,
  pollingInterval: null as number | null,

  init() {
    MusicCache.load();
    // 创建一个全局 audio 元素
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.addEventListener('timeupdate', () => {
        if (this.audioElement) {
          this.currentTime = this.audioElement.currentTime * 1000;
        }
      });
      this.audioElement.addEventListener('ended', () => {
        this.isPlaying = false;
        toastr.info('播放结束');
      });
      this.audioElement.addEventListener('error', (e) => {
        console.error('[Music] 播放出错', e);
        toastr.error('无法播放此歌曲 (可能是 VIP 歌曲或版权限制)');
        this.isPlaying = false;
      });
      document.body.appendChild(this.audioElement);
    }
    // 开始轮询当前播放状态
    this.startPolling();
  },

  async play(song: SongInfo) {
    if (!this.audioElement) this.init();
    
    // 如果是同一首，直接播放
    if (this.currentSong?.id === song.id && this.audioElement?.src) {
        this.audioElement.play();
        this.isPlaying = true;
        return;
    }

    // 获取 URL
    const url = await MusicApi.getSongUrl(song.id);
    if (!url) {
        toastr.error('无法获取歌曲链接');
        return;
    }

    // 切歌
    this.currentSong = song;
    if (this.audioElement) {
        this.audioElement.src = url;
        this.audioElement.play();
        this.isPlaying = true;
        
        // 加载歌词
        if (!song.lrcLines) {
            const lrc = await MusicApi.getLyric(song.id);
            song.lrc = lrc;
            song.lrcLines = LyricParser.parse(lrc);
        }
        
        toastr.success(`正在播放: ${song.name} - ${song.artist}`);
    }
  },

  pause() {
    this.audioElement?.pause();
    this.isPlaying = false;
  },

  // 轮询当前播放状态
  startPolling(intervalMs: number = 3000) {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      const playback = await MusicApi.getCurrentPlayback();
      if (!playback) {
        // 更新状态栏：未连接
        SyncStatusBar.updatePlaybackStatus(null);
        return;
      }
      
      // 更新状态栏
      SyncStatusBar.updatePlaybackStatus(playback);
      
      // 如果有网易云 ID，尝试切换歌曲
      if (playback.neteaseId && playback.neteaseId !== this.currentSong?.id) {
        // 创建歌曲信息对象
        const song: SongInfo = {
          id: playback.neteaseId,
          name: playback.title || '未知歌曲',
          artist: playback.artist || '未知艺术家',
          coverUrl: playback.coverUrl || '',
          duration: playback.duration || 0
        };
        // 播放歌曲（如果正在播放）
        if (playback.isPlaying) {
          await this.play(song);
        } else {
          // 更新当前歌曲信息但不播放
          this.currentSong = song;
        }
      } else if (playback.isPlaying !== this.isPlaying) {
        // 播放状态变化
        if (playback.isPlaying) {
          // 恢复播放
          this.audioElement?.play();
          this.isPlaying = true;
        } else {
          this.pause();
        }
      }
    }, intervalMs);
  }
};

// ------------------------------------------------------------------------------------------------
// 4. 注入提示词逻辑 (Prompt Injection)
// ------------------------------------------------------------------------------------------------

const musicPromptGenerator = () => {
    if (!PlayerState.currentSong || !PlayerState.isPlaying) {
        return ''; // 不播放时不注入
    }
    
    const { recentPast, nearFuture } = LyricParser.getSlice(
        PlayerState.currentSong.lrcLines || [], 
        PlayerState.currentTime
    );

    const statusJson = {
        song: {
            id: PlayerState.currentSong.id,
            title: PlayerState.currentSong.name,
            artist: PlayerState.currentSong.artist
        },
        playback: {
            current_position_ms: Math.floor(PlayerState.currentTime),
            duration_ms: PlayerState.currentSong.duration,
            is_playing: PlayerState.isPlaying
        },
        lyrics: {
            current: recentPast.map(l => l.text),
            next: nearFuture.map(l => l.text)
        }
    };

    return JSON.stringify(statusJson);
};

// ------------------------------------------------------------------------------------------------
// 5. 界面组件 (UI Components)
// ------------------------------------------------------------------------------------------------

// 同步状态栏组件
const SyncStatusBar = {
  element: null as HTMLElement | null,
  
  init() {
    // 如果已存在则移除
    const existing = document.getElementById('netease-music-status-bar');
    if (existing) existing.remove();
    
    // 创建状态栏元素
    const statusBar = document.createElement('div');
    statusBar.id = 'netease-music-status-bar';
    statusBar.style.position = 'fixed';
    statusBar.style.bottom = '0';
    statusBar.style.left = '0';
    statusBar.style.width = '100%';
    statusBar.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    statusBar.style.color = 'white';
    statusBar.style.padding = '8px 16px';
    statusBar.style.fontSize = '14px';
    statusBar.style.zIndex = '9999';
    statusBar.style.display = 'flex';
    statusBar.style.justifyContent = 'space-between';
    statusBar.style.alignItems = 'center';
    statusBar.style.boxShadow = '0 -2px 10px rgba(0, 0, 0, 0.3)';
    statusBar.style.transition = 'all 0.3s ease';
    
    // 左侧状态信息
    const statusText = document.createElement('div');
    statusText.id = 'netease-music-status-text';
    statusText.textContent = '未连接到网易云音乐';
    statusText.style.flex = '1';
    
    // 右侧操作按钮
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    
    // 设置 Cookie 按钮
    const cookieButton = document.createElement('button');
    cookieButton.textContent = '设置 Cookie';
    cookieButton.style.padding = '4px 8px';
    cookieButton.style.backgroundColor = 'rgba(66, 133, 244, 0.8)';
    cookieButton.style.color = 'white';
    cookieButton.style.border = 'none';
    cookieButton.style.borderRadius = '4px';
    cookieButton.style.cursor = 'pointer';
    cookieButton.style.fontSize = '12px';
    cookieButton.addEventListener('click', () => {
      this.showCookiePopup();
    });
    
    // 隐藏按钮
    const hideButton = document.createElement('button');
    hideButton.textContent = '隐藏';
    hideButton.style.padding = '4px 8px';
    hideButton.style.backgroundColor = 'rgba(100, 100, 100, 0.8)';
    hideButton.style.color = 'white';
    hideButton.style.border = 'none';
    hideButton.style.borderRadius = '4px';
    hideButton.style.cursor = 'pointer';
    hideButton.style.fontSize = '12px';
    hideButton.addEventListener('click', () => {
      this.toggleVisibility();
    });
    
    buttonContainer.appendChild(cookieButton);
    buttonContainer.appendChild(hideButton);
    
    statusBar.appendChild(statusText);
    statusBar.appendChild(buttonContainer);
    
    document.body.appendChild(statusBar);
    this.element = statusBar;
    
    // 监听播放状态变化
    this.updateStatus('未连接到网易云音乐');
  },
  
  updateStatus(text: string) {
    const statusText = document.getElementById('netease-music-status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  },
  
  showCookiePopup() {
    // 使用 SillyTavern.Popup 显示 Cookie 输入弹窗
    if (SillyTavern && SillyTavern.Popup) {
      const popupContent = `
        <div style="padding: 20px; max-width: 500px;">
          <h3 style="margin-top: 0;">设置网易云 Cookie</h3>
          <p>请粘贴您的网易云 Cookie：</p>
          <textarea id="cookie-input" style="width: 100%; height: 120px; padding: 8px; margin-bottom: 16px;" placeholder="粘贴完整的 Cookie 内容..."></textarea>
          <p style="font-size: 12px; color: #666;">
            如何获取 Cookie：<br>
            1. 在浏览器中登录网易云音乐网页版<br>
            2. 按 F12 打开开发者工具<br>
            3. 切换到 Network 选项卡<br>
            4. 刷新页面，找到任意请求<br>
            5. 复制 Request Headers 中的 Cookie 字段
          </p>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cookie-cancel" style="padding: 8px 16px; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">取消</button>
            <button id="cookie-submit" style="padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">确认</button>
          </div>
        </div>
      `;
      
      const popup = new SillyTavern.Popup(popupContent, 0, '', { title: '网易云 Cookie 设置' } as any);
      popup.show();
      
      // 手动处理按钮点击事件
      setTimeout(() => {
        const submitBtn = document.getElementById('cookie-submit');
        const cancelBtn = document.getElementById('cookie-cancel');
        const textarea = document.getElementById('cookie-input') as HTMLTextAreaElement;
        
        if (submitBtn) {
          submitBtn.addEventListener('click', async () => {
            if (textarea && textarea.value.trim()) {
              MusicApi.setCookie(textarea.value.trim());
              await popup.complete(1);
              this.updateStatus('Cookie 已设置，正在同步...');
            }
          });
        }
        
        if (cancelBtn) {
          cancelBtn.addEventListener('click', async () => {
            await popup.complete(0);
          });
        }
      }, 100);
    } else {
      // 备用方案：使用 prompt
      const cookie = prompt('请输入网易云 Cookie：');
      if (cookie) {
        MusicApi.setCookie(cookie);
        this.updateStatus('Cookie 已设置，正在同步...');
      }
    }
  },
  
  toggleVisibility() {
    if (this.element) {
      const isHidden = this.element.style.display === 'none';
      this.element.style.display = isHidden ? 'flex' : 'none';
      const hideButton = this.element.querySelector('button:nth-child(2)') as HTMLButtonElement;
      if (hideButton) {
        hideButton.textContent = isHidden ? '隐藏' : '显示';
      }
    }
  },
  
  updatePlaybackStatus(playback: { title?: string; artist?: string; isPlaying?: boolean } | null) {
    if (!playback) {
      this.updateStatus('未连接到网易云音乐');
      return;
    }
    
    if (playback.title && playback.artist) {
      const status = `${playback.isPlaying ? '▶️' : '⏸️'} ${playback.title} - ${playback.artist}`;
      this.updateStatus(status);
    } else {
      this.updateStatus('正在同步播放状态...');
    }
  }
};



// ------------------------------------------------------------------------------------------------
// 6. 悬浮球与音乐窗口组件
// ------------------------------------------------------------------------------------------------

// 悬浮球组件
const FloatingBall = {
  element: null as HTMLElement | null,
  isVisible: false,
  
  create() {
    // 如果已存在则移除
    const existing = document.getElementById('netease-music-floating-ball');
    if (existing) existing.remove();
    
    // 创建悬浮球元素
    const ball = document.createElement('div');
    ball.id = 'netease-music-floating-ball';
    ball.style.position = 'fixed';
    ball.style.bottom = '80px';
    ball.style.right = '20px';
    ball.style.width = '60px';
    ball.style.height = '60px';
    ball.style.backgroundColor = 'rgba(66, 133, 244, 0.9)';
    ball.style.color = 'white';
    ball.style.borderRadius = '50%';
    ball.style.display = 'flex';
    ball.style.alignItems = 'center';
    ball.style.justifyContent = 'center';
    ball.style.fontSize = '24px';
    ball.style.cursor = 'pointer';
    ball.style.zIndex = '9998';
    ball.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    ball.style.transition = 'all 0.3s ease';
    
    // 添加音乐图标
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-music';
    ball.appendChild(icon);
    
    // 点击显示音乐窗口
    ball.addEventListener('click', () => {
      MusicWindow.toggle();
    });
    
    // 拖拽功能
    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    
    ball.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = ball.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      ball.style.left = `${startLeft + dx}px`;
      ball.style.top = `${startTop + dy}px`;
      ball.style.right = 'auto';
      ball.style.bottom = 'auto';
    };
    
    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.body.appendChild(ball);
    this.element = ball;
    this.isVisible = true;
    
    // 显示创建提示
    toastr.info('悬浮球已创建，点击打开音乐窗口');
  },
  
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  },
  
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
    }
 }
 };

// 音乐悬浮窗组件（纯展示型，无播放控制）
const MusicWindow = {
  element: null as HTMLElement | null,
  isVisible: false,
  
  create() {
    // 如果已存在则移除
    const existing = document.getElementById('netease-music-window');
    if (existing) existing.remove();
    
    // 创建音乐窗口元素
    const windowEl = document.createElement('div');
    windowEl.id = 'netease-music-window';
    windowEl.style.position = 'fixed';
    windowEl.style.bottom = '150px';
    windowEl.style.right = '20px';
    windowEl.style.width = '320px';
    windowEl.style.backgroundColor = 'rgba(30, 30, 30, 0.95)';
    windowEl.style.color = 'white';
    windowEl.style.borderRadius = '12px';
    windowEl.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
    windowEl.style.zIndex = '9997';
    windowEl.style.overflow = 'hidden';
    windowEl.style.display = 'none';
    windowEl.style.transition = 'all 0.3s ease';
    
    // 窗口标题栏   
 const titleBar = document.createElement('div');
    titleBar.style.padding = '12px 16px';
    titleBar.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    titleBar.style.display = 'flex';
    titleBar.style.justifyContent = 'space-between';
    titleBar.style.alignItems = 'center';
    titleBar.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    
    const titleText = document.createElement('div');
    titleText.textContent = '当前播放';
    titleText.style.fontWeight = 'bold';
    titleText.style.fontSize = '16px';
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.width = '24px';
    closeButton.style.height = '24px';
    closeButton.addEventListener('click', () => {
      this.hide();
    });
    
    titleBar.appendChild(titleText);
    titleBar.appendChild(closeButton);
    
    // 内容区域
    const content = document.createElement('div');
    content.style.padding = '20px';
    
    // 歌曲封面
    const coverContainer = document.createElement('div');
    coverContainer.style.textAlign = 'center';
    coverContainer.style.marginBottom = '20px';
    
    const coverImg = document.createElement('img');
    coverImg.id = 'music-window-cover';
    coverImg.style.width = '160px';
    coverImg.style.height = '160px';
    coverImg.style.borderRadius = '8px';
    coverImg.style.objectFit = 'cover';
    coverImg.style.backgroundColor = 'rgba(60, 60, 60, 0.5)';
    coverImg.style.display = 'block';
    coverImg.style.margin = '0 auto';
    coverImg.src = '';
    
    const coverFallback = document.createElement('div');
    coverFallback.id = 'music-window-cover-fallback';
    coverFallback.style.width = '160px';
    coverFallback.style.height = '160px';
    coverFallback.style.borderRadius = '8px';
    coverFallback.style.backgroundColor = 'rgba(66, 133, 244, 0.3)';
    coverFallback.style.display = 'flex';
    coverFallback.style.alignItems = 'center';
    coverFallback.style.justifyContent = 'center';
    coverFallback.style.margin = '0 auto';
    coverFallback.innerHTML = '<i class="fa-solid fa-music" style="font-size: 48px; color: rgba(255, 255, 255, 0.5);"></i>';
    
    coverContainer.appendChild(coverImg);
    coverContainer.appendChild(coverFallback);
    
    // 歌曲信息
    const infoContainer = document.createElement('div');
    infoContainer.style.textAlign = 'center';
    
    const songTitle = document.createElement('div');
    songTitle.id = 'music-window-title';
    songTitle.textContent = '无歌曲播放';
    songTitle.style.fontSize = '18px';
    songTitle.style.fontWeight = 'bold';
    songTitle.style.marginBottom = '8px';
    songTitle.style.whiteSpace = 'nowrap   ';
 songTitle.style.overflow = 'hidden';
    songTitle.style.textOverflow = 'ellipsis';
    
    const songArtist = document.createElement('div');
    songArtist.id = 'music-window-artist';
    songArtist.textContent = '未知艺术家';
    songArtist.style.fontSize = '14px';
    songArtist.style.color = 'rgba(255, 255, 255, 0.7)';
    songArtist.style.marginBottom = '16px';
    songArtist.style.whiteSpace = 'nowrap';
    songArtist.style.overflow = 'hidden';
    songArtist.style.textOverflow = 'ellipsis';
    
    // 播放状态
    const statusContainer = document.createElement('div');
    statusContainer.style.display = 'flex';
    statusContainer.style.alignItems = 'center';
    statusContainer.style.justifyContent = 'center';
    statusContainer.style.gap = '8px';
    statusContainer.style.marginTop = '16px';
    statusContainer.style.padding = '12px';
    statusContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    statusContainer.style.borderRadius = '8px';
    
    const statusIcon = document.createElement('div');
    statusIcon.id = 'music-window-status-icon';
    statusIcon.textContent = '⏸️';
    statusIcon.style.fontSize = '20px';
    
    const statusText = document.createElement('div');
    statusText.id = 'music-window-status-text';
    statusText.textContent = '未连接';
    statusText.style.fontSize = '14px';
    
    statusContainer.appendChild(statusIcon);
    statusContainer.appendChild(statusText);
    
    infoContainer.appendChild(songTitle);
    infoContainer.appendChild(songArtist);
    infoContainer.appendChild(statusContainer);
    
    content.appendChild(coverContainer);
    content.appendChild(infoContainer);
    
    windowEl.appendChild(titleBar);
    windowEl.appendChild(content);
    
    document.body.appendChild(windowEl);
    this.element = windowEl;
    
    // 初始化歌曲信息更新监听
    this.startInfoUpdater();
  },
  
  startInfoUpdater() {
    // 每3秒更新一次显示信息
    setInterval(() => {
      this.updateDisplay();
    }, 3000);
  },
  
  updateDisplay() {
    if (!this.element || !this.isVisible) return;
    
    const currentSong = PlayerState.currentSong;
    const isPlaying = PlayerState.isPlaying;
    
    // 更新封面
    const coverImg = document.getElementById('music-window-cover') as HTMLImageElement;
    const coverFallback = document.getElementById('music-window-cover-fallback');
    
    if (currentSong && currentSong.coverUrl) {
      if (coverImg) {
        coverImg.src = currentSong.coverUrl;
        coverImg.style.display = 'block';
      }
      if (coverFallback) {
        coverFallback.style.display = 'none';
      }
    } else {
      if (coverImg) {
        coverImg.style.display = 'none';
      }
      if (coverFallback) {
        coverFallback.style.display = 'flex';
      }
    }
    
    // 更新歌曲信息
    const titleEl = document.getElementById('music-window-title');
    const artistEl = document.getElementById('music-window-artist');
    const statusIcon = document.getElementById('music-window-status-icon');
    const statusText = document.getElementById('music-window-status-text');
    
    if (currentSong) {
      if (titleEl) titleEl.textContent = currentSong.name || '未知歌曲';
      if (artistEl) artistEl.textContent = currentSong.artist || '未知艺术家';
      if (statusIcon) statusIcon.textContent = isPlaying ? '▶️' : '⏸️';
      if (statusText) statusText.textContent = isPlaying ? '播放中' : '已暂停';
    } else {
      if (titleEl) titleEl.textContent = '无歌曲播放';
      if (artistEl) artistEl.textContent = '未知艺术家';
      if (statusIcon) statusIcon.textContent = '⏸️';
      if (statusText) statusText.textContent = '未连接';
    }
  },
  
  show() {
    if (!this.element) {
      this.create();
    }
    if (this.element) {
      this.element.style.display = 'block';
      this.isVisible = true;
      this.updateDisplay();
    }
  },
  
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  },
  
  toggle() {
    if (!this.isVisible) {
      this.show();
    } else {
      this.hide();
    }
  }
};

// ------------------------------------------------------------------------------------------------
// 7. 注册 Slash 命令
// ------------------------------------------------------------------------------------------------

$(() => {
    PlayerState.init();
    // 初始化同步状态栏
    SyncStatusBar.init();

    // 注册 /163 cookie 命令
    if (window.registerSlashCommand) {
        window.registerSlashCommand('163', async (args: string[], value: string) => {
            const cmd = args[1];
            if (cmd === 'cookie') {
                const cookie = value.replace('cookie', '').trim();
                if (cookie) {
                    MusicApi.setCookie(cookie);
                } else {
                    toastr.info('请提供 Cookie');
                }
            } else {
                toastr.info('可用命令: /163 cookie [value] - 设置网易云 Cookie');
            }
        }, [], '网易云音乐控制: /163 cookie [value]', true, true);
    }

    // 监听生成开始，动态更新 prompt 内容
    eventOn(tavern_events.GENERATION_STARTED, async () => {
        const content = musicPromptGenerator();
        if (content && SillyTavern.setExtensionPrompt) {
            await SillyTavern.setExtensionPrompt(
                'netease-music-status',
                content,
                1, // post-history
                0, // depth
                false,
                0,
                () => PlayerState.isPlaying
            );
        }
    });

    // 初始化全局插件对象
    window.NeteaseMusicPlugin = {
        createFloatingBall: FloatingBall.create,
        hideFloatingBall: FloatingBall.hide,
        showCookiePopup: SyncStatusBar.showCookiePopup.bind(SyncStatusBar),
        refreshPlayback: PlayerState.startPolling.bind(PlayerState)
    };
});
