/** help 命名空间：v1.2 M5 帮助中心 FAQ（设置页锚点 help-center，答案为精简 Markdown） */
export const zhHelp = {
  title: '帮助与常见问题',
  description: '安装、供应商、语音模型、数据备份与卸载的常见问题。没有解决？查看日志或到 Release 页面反馈。',
  viewHelp: '查看帮助',
  items: {
    firstSteps: {
      q: '第一次使用，从哪里开始？',
      a: '按以下顺序即可开始对话：\n\n1. 在「设置」中添加一个**模型供应商**（云端 API 或本地 Ollama）。\n2. 在供应商卡片上「获取远程模型」并添加一个对话模型。\n3. 在「默认模型」中选中它，回到对话页发送第一句话。\n\n首次启动会自动弹出向导，也可以在「设置 → 关于」中随时重放。',
    },
    install: {
      q: 'Windows 安装时提示「未知发布者」或 SmartScreen 拦截？',
      a: '应用尚未购买 EV 代码签名证书时，SmartScreen 可能拦截未广泛分发的安装包：\n\n- 点击「更多信息」→「仍要运行」。\n- 安装后如语音功能异常，请确认安装目录未被安全软件隔离。\n- 建议从 GitHub Release 页面下载安装包，勿使用第三方转载。',
    },
    provider: {
      q: '如何配置云端模型供应商？',
      a: '在「设置 → 供应商」点击「添加供应商」：\n\n- 协议选 `OpenAI 兼容`。\n- 填写厂商提供的 **Base URL** 与 **API Key**。\n- 保存后在卡片上点「测试连接」验证密钥与网络。\n\nAPI Key 使用系统加密能力保存在本机；若换设备或重装系统，需要重新输入。',
    },
    ollama: {
      q: '如何使用本地 Ollama，检测不到怎么办？',
      a: '1. 从 [ollama.com/download](https://ollama.com/download) 安装并启动 Ollama。\n2. 终端执行 `ollama pull qwen2.5:7b` 拉取模型。\n3. 在应用中添加协议为 `Ollama`、地址为 `http://127.0.0.1:11434` 的供应商。\n\n仍失败时：确认 `ollama serve` 正在运行；浏览器/应用与 Ollama 在同一台机器；若改过监听地址，请同步修改 Base URL。',
    },
    models: {
      q: '模型列表为空，或添加后不能对话？',
      a: '- 在供应商卡片点击「获取远程模型」，点选发现的模型快速添加；也可以手动输入模型 ID。\n- 手动输入时请与供应商的模型名**完全一致**（如 `gpt-4o-mini`）。\n- 对话需要带「对话」能力的模型；知识库需要「嵌入」能力模型（如 `bge-m3`）；识图需要「视觉」能力。\n- 在「默认模型」面板选择默认对话/嵌入模型。',
    },
    voice: {
      q: '语音模型下载慢或失败？',
      a: '- 语音识别约 228MB、语音合成约 190MB，国内网络建议配置镜像（`hf-mirror.com`）。\n- 下载中断后重新点击下载会跳过已完成的文件断点续传。\n- Windows 打包态语音验证需确认数据根指向真实模型目录（开发与打包的密钥体系不互通，属正常现象）。\n- 模型就绪后，使用输入框旁麦克风按钮发起语音对话。',
    },
    data: {
      q: '我的数据存在哪里？如何备份？',
      a: '- 数据默认保存在用户目录下的应用私有数据目录（可用环境变量 `WBFM_DATA_ROOT` 覆盖），包括数据库、附件与语音模型。\n- 在「设置 → 备份」可导出归档（对话、知识库、设置等），并在新机导入恢复。\n- 应用本身不上传你的对话与密钥。',
    },
    uninstall: {
      q: '卸载会删除我的数据吗？',
      a: '默认**不会**：卸载只移除程序文件，数据目录保留。卸载器提供可选的「同时删除数据」项，默认不勾选；勾选并确认后数据不可恢复，请先备份。',
    },
    shortcuts: {
      q: '有哪些快捷键？',
      a: '随时按 `Ctrl + /` 查看快捷键浮层，常用：\n\n- `Ctrl + K`：打开命令面板\n- `Ctrl + /`：快捷键列表\n- `Ctrl + Alt + Esc`：急停全部桌面任务\n- `Enter` 发送 / `Shift + Enter` 换行 / `Esc` 关闭对话框',
    },
    update: {
      q: '自动更新失败怎么办？',
      a: '- 在「设置 → 关于」查看更新通道与状态，可切换稳定/Beta 通道后重试。\n- 开发环境不检查更新。\n- 仍失败时可到 GitHub Release 页面手动下载最新安装包覆盖安装，数据与设置不会丢失。',
    },
  },
};

export const enHelp = {
  title: 'Help & FAQ',
  description: 'Common questions about installation, providers, voice models, backup and uninstall. If these do not help, check the logs or open an issue on the Releases page.',
  viewHelp: 'View help',
  items: {
    firstSteps: {
      q: 'Where do I start as a new user?',
      a: 'To start chatting:\n\n1. Add a **model provider** in Settings (cloud API or local Ollama).\n2. Click “Fetch remote models” on the provider card and add a chat model.\n3. Select it under **Default models**, then send your first message from the Chat page.\n\nThe setup wizard opens on first launch; you can replay it anytime from Settings → About.',
    },
    install: {
      q: 'Windows shows “Unknown publisher” or blocks the installer (SmartScreen)?',
      a: 'Without a widely-trusted EV signing certificate, SmartScreen may block the installer:\n\n- Click “More info” → “Run anyway”.\n- If voice features fail after install, make sure security software has not quarantined the install folder.\n- Download only from the GitHub Releases page, never third-party mirrors.',
    },
    provider: {
      q: 'How do I configure a cloud model provider?',
      a: 'In Settings → Providers, click “Add provider”:\n\n- Choose the `OpenAI-compatible` protocol.\n- Fill in the **Base URL** and **API Key** from your vendor.\n- Save, then click “Test connection” on the card.\n\nThe API key is encrypted on this machine using the OS key store; after reinstalling or moving computers you need to enter it again.',
    },
    ollama: {
      q: 'How do I use local Ollama, or fix detection failures?',
      a: '1. Install and start Ollama from [ollama.com/download](https://ollama.com/download).\n2. Run `ollama pull qwen2.5:7b` in a terminal.\n3. Add a provider with protocol `Ollama` and URL `http://127.0.0.1:11434`.\n\nIf detection still fails: make sure `ollama serve` is running, the browser/app and Ollama are on the same machine, and update the Base URL if you changed the listen address.',
    },
    models: {
      q: 'The model list is empty, or a model cannot chat after adding it?',
      a: '- Click “Fetch remote models” on the provider card and pick a discovered model, or type the model ID manually.\n- Manual IDs must match the vendor name **exactly** (e.g. `gpt-4o-mini`).\n- Chat requires a model with the Chat capability; knowledge base needs Embedding (e.g. `bge-m3`); image understanding needs Vision.\n- Choose default chat/embedding models in the Default models panel.',
    },
    voice: {
      q: 'Voice model downloads are slow or failing?',
      a: '- Recognition is about 228MB and synthesis about 190MB. On constrained networks configure a mirror (`hf-mirror.com`).\n- Restarting a download resumes from completed files.\n- On Windows packaged builds, point the data root to the real model directory; dev and packaged key stores differ by design.\n- Once models are ready, use the microphone button next to the composer.',
    },
    data: {
      q: 'Where is my data stored and how do I back it up?',
      a: '- Data lives in the app’s private data directory under your user folder by default (override with the `WBFM_DATA_ROOT` environment variable), including the database, attachments and voice models.\n- Use Settings → Backup to export an archive (conversations, knowledge bases, settings) and restore it on another machine.\n- Your conversations and keys are never uploaded.',
    },
    uninstall: {
      q: 'Does uninstalling delete my data?',
      a: 'By default **no**: uninstalling removes program files but keeps the data directory. The uninstaller offers an optional “delete my data as well” checkbox, unchecked by default; once confirmed the deletion is irreversible, so back up first.',
    },
    shortcuts: {
      q: 'What keyboard shortcuts are available?',
      a: 'Press `Ctrl + /` anytime to open the shortcuts overlay:\n\n- `Ctrl + K`: command palette\n- `Ctrl + /`: this shortcuts list\n- `Ctrl + Alt + Esc`: emergency-stop all desktop tasks\n- `Enter` to send / `Shift + Enter` for a new line / `Esc` to close dialogs',
    },
    update: {
      q: 'What if automatic updates fail?',
      a: '- Check the channel and status in Settings → About; switch between Stable and Beta and retry.\n- Updates are not checked in development.\n- Otherwise, download the latest installer manually from the GitHub Releases page and install over the existing version — data and settings are preserved.',
    },
  },
};
