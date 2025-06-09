const config = {
  // 解析模式 'singleSite' 单个站点 | 'multipleSites' 多个站点
  extractMode: 'singleSite',
  // 下载模式 'downloadAllImages' | 'downloadOriginImagesByThumbnails'
  downloadMode: 'downloadAllImages',
  // 目标解析网站
  // url: 'https://www.duitang.com/blog/?id=1507598814',
  // url: 'file:///Users/claude/Projects/%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/%E7%88%AC%E8%99%AB/web-crawler-nodejs/%E6%B5%8B%E8%AF%95%E9%A1%B5%E9%9D%A2.html',
  // url: 'https://www.duitang.com/category/?cat=wallpaper',
  url: 'https://wallspic.com/cn/album/for_mobile',
  // 多个目标解析网站
  urls: [],
  // 重试间隔(秒钟)-如果有下载失败的照片，服务会等待一段时间，然后重新下载请求失败的照片，默认 5 秒钟
  retryInterval: 5,
  // 重试次数
  retriesCount: 1,
  // 最大并发请求数（每一轮）
  maxConcurrentRequests: 20,
  // 最大请求间隔时间（毫秒）
  maxIntervalMs: 100,
  // 最小请求间隔时间（毫秒）
  minIntervalMs: 50,
  // 下载的文件夹路径（不填默认根据网页标题创建文件夹，下载到download文件夹）
  downloadFolderPath: '',
  // 浏览器配置
  browser: {
    headless: false,
  },
  // 日志级别控制 'debug' | 'info' | 'warn' | 'error'
  // debug: 显示所有日志（调试、信息、警告、错误）
  // info: 显示信息、警告、错误日志
  // warn: 显示警告、错误日志  
  // error: 仅显示错误日志
  logLevel: 'debug',
  // 是否启用高颜值进度条 (true: 启用cli-progress进度条, false: 使用传统日志输出)
  enableProgressBar: false,
  // 进度条更新频率 'realtime' | 'fast' | 'normal' | 'slow'
  // realtime: 实时更新，每次下载成功都立即显示 (60fps) 推荐使用 🔥
  // fast: 快速更新，每秒30次更新
  // normal: 正常更新，每秒10次更新（原设置）
  // slow: 缓慢更新，每秒5次更新
  progressUpdateFrequency: 'realtime',
  // 页面池管理策略 'auto' | 'reuse' | 'progressive'
  // FIXME:用来测试
  pagePoolStrategy: 'reuse', // auto: 根据图片数量自动选择, reuse: 复用式, progressive: 渐进式
}

export { config }
