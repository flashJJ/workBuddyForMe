/** avatar 命名空间：Live2D 形象栏/舞台与内置模型选择器展示名 */
export const zhAvatar = {
  rail: {
    title: '本地形象',
  },
  state: {
    speaking: '说话中',
    idle: '待机',
  },
  stage: {
    ariaLabel: 'Live2D 虚拟形象（点击互动）',
    loading: '正在加载形象资源…',
    loadFailed: 'Live2D 模型加载失败：{message}',
  },
  models: {
    haru: 'Haru · 晴（官方接待员）',
    hiyori: 'Hiyori · 百濑日和（休闲少女）',
    mark: 'Mark · 马克（帽衫少年）',
    mao: 'Mao · 虹猫（魔法少女）',
    wanko: 'Wanko · 汪子饼（柴犬吉祥物）',
  },
  vrm: {
    sectionTitle: '已导入 VRM',
    importTitle: '导入 VRM 模型',
    importHint: '支持 .vrm 格式（≤60MB），仅本地渲染，不联网传输',
    fileLabel: '选择文件',
    metaTitle: '模型许可信息',
    metaAuthor: '作者',
    metaLicense: '许可',
    metaVersion: 'VRM 版本',
    disclaimerTitle: '使用声明',
    disclaimerText:
      '你可以导入自己拥有或已获得合法授权的 VRM 模型。WorkBuddy For Me 仅提供本地渲染能力，不提供模型下载，也不主张任何第三方模型的权利。模型的著作权、人格演绎许可与商用许可归模型作者所有，具体许可以模型文件内声明及作者给出的条款为准。请仅在授权范围内使用；因导入模型引发的版权或授权争议，由你自行承担责任。',
    disclaimerConfirm: '我已阅读并同意上述声明',
    importSuccess: '导入成功：{name}',
    importFailed: '导入失败：{message}',
    deleteConfirm: '确定删除已导入的 VRM 模型「{name}」？删除后不可恢复。',
    empty: '暂无已导入的 VRM 模型',
    unsupportedType: '仅支持 .vrm 文件',
    tooLarge: '文件超过 60MB 上限',
    invalidVrm: '不是合法的 VRM 文件（需 glTF 二进制格式且含 VRM 扩展）',
  },
};

export const enAvatar = {
  rail: {
    title: 'Local avatar',
  },
  state: {
    speaking: 'Speaking',
    idle: 'Idle',
  },
  stage: {
    ariaLabel: 'Live2D virtual avatar (click to interact)',
    loading: 'Loading avatar assets...',
    loadFailed: 'Failed to load Live2D model: {message}',
  },
  models: {
    haru: 'Haru · Official greeter',
    hiyori: 'Hiyori · Casual girl',
    mark: 'Mark · Hoodie boy',
    mao: 'Mao · Magical girl',
    wanko: 'Wanko · Shiba mascot',
  },
  vrm: {
    sectionTitle: 'Imported VRM',
    importTitle: 'Import VRM Model',
    importHint: '.vrm only (≤60MB); local rendering only, no network transfer',
    fileLabel: 'Select file',
    metaTitle: 'Model License',
    metaAuthor: 'Author',
    metaLicense: 'License',
    metaVersion: 'VRM Version',
    disclaimerTitle: 'Disclaimer',
    disclaimerText:
      'You may import VRM models that you own or have legally authorized. WorkBuddy For Me only provides local rendering capabilities, does not provide model downloads, and does not claim any rights to third-party models. Copyright, character usage, and commercial licenses belong to the model author, subject to the terms declared in the model file and provided by the author. Please use only within the scope of authorization; any copyright or licensing disputes arising from imported models are your sole responsibility.',
    disclaimerConfirm: 'I have read and agree to the above terms',
    importSuccess: 'Imported: {name}',
    importFailed: 'Import failed: {message}',
    deleteConfirm: 'Delete imported VRM model "{name}"? This cannot be undone.',
    empty: 'No imported VRM models yet',
    unsupportedType: 'Only .vrm files are supported',
    tooLarge: 'File exceeds 60MB limit',
    invalidVrm: 'Not a valid VRM file (must be glTF binary with VRM extension)',
  },
};
