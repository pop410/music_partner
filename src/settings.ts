const Settings = z
  .object({
    // 是否启用悬浮球模式
    enableFloatingBall: z.boolean().default(false),
    // 是否在插件组中显示
    showInExtensionGroup: z.boolean().default(true),
    // Cookie存储（加密或只存标记）
    cookieSet: z.boolean().default(false),
    // 自动同步频率（秒）
    syncInterval: z.number().default(5),
    // 是否启用图片缓存
    enableImageCache: z.boolean().default(true),
    // 是否显示状态栏
    showStatusBar: z.boolean().default(true),
  })
  .prefault({});

export const useSettingsStore = defineStore('netease-music-settings', () => {
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});