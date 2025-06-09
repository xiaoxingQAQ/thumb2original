# Web Crawler NodeJs

一个基于 Node.js 和 Puppeteer 的网页图片爬虫工具。

## 特性

✅ **智能图片提取**：自动识别和提取网页中的图片链接  
✅ **多种下载方式**：支持 Puppeteer 和 Axios 两种下载方式  
✅ **智能Fallback机制**：Puppeteer下载失败时自动切换到Axios，提升成功率  
✅ **格式转换**：自动将 WebP 格式转换为 PNG  
✅ **防下载弹窗**：解决 Puppeteer 访问图片链接时的下载确认弹窗问题  
✅ **智能重试机制**：优雅的倒计时显示，避免日志刷屏  
✅ **高颜值进度条**：实时显示下载进度、速率、ETA等信息  
✅ **并发控制**：可配置的并发下载数量  

## 项目设置

```bash
npm install
```

## 运行

### 开发模式
```bash
npm run serve
```

### 测试重试倒计时功能
```bash
node test-retry-countdown.js
```

## 重要特性

### 🚀 智能Fallback机制

当Puppeteer下载失败时，系统会自动切换到Axios进行下载，显著提升下载成功率：

**工作原理：**
- ✅ 优先使用Puppeteer下载（支持复杂页面渲染）
- ✅ 检测各种失败场景：`net::ERR_ABORTED`、连接错误、超时等
- ✅ 失败时自动fallback到Axios下载同一URL
- ✅ 只有双重失败才记录为真正失败
- ✅ 下一个URL仍优先使用Puppeteer，保持策略一致性

**支持的错误类型：**
```
net::ERR_ABORTED                    // 连接中断
net::ERR_CONNECTION_CLOSED          // 连接关闭  
Navigation timeout exceeded         // 导航超时
Could not load body for request     // 请求体加载失败
```

**测试验证：**
```bash
node test-puppeteer-axios-fallback.js  # 基础功能测试
node test-fallback-specific.js         # 特定错误场景测试
```

### 🔄 优雅的重试倒计时

重新设计了重试机制，使用 `process.stdout.write` 替代传统日志输出：

**优点：**
- ✅ 在同一行显示倒计时，避免刷屏
- ✅ 彩色文字提示，更加美观
- ✅ 显示重试次数进度（第X/Y次）
- ✅ 倒计时结束自动清理输出行

**示例效果：**
```
🔄 重试倒计时 (第1/3次): 5s
```

### 📊 高颜值进度条

集成 cli-progress 库，提供专业级的进度条显示：

- ✅ 实时更新下载进度
- ✅ 显示下载速率、ETA、成功率
- ✅ 零刷屏设计，优雅的用户体验
- ✅ 可配置更新频率（realtime/fast/normal/slow）

### Puppeteer 下载弹窗问题

当访问某些图片链接时，如果链接会直接触发文件下载，浏览器会弹出确认对话框。本项目已解决此问题：

- **浏览器启动优化**：添加禁用下载的启动参数
- **请求拦截**：设置请求拦截避免触发下载
- **优雅关闭**：实现浏览器的优雅关闭机制
- **独立下载页面**：为每个图片下载创建独立页面

详细信息请参考：[PUPPETEER_DOWNLOAD_FIX.md](./PUPPETEER_DOWNLOAD_FIX.md)

## 配置说明

主要配置文件：`src/config.js`

```javascript
const config = {
  extractMode: 'singleSite',           // 解析模式
  downloadMode: 'downloadAllImages',   // 下载模式  
  url: 'https://example.com',          // 目标网站
  retryInterval: 5,                    // 重试间隔(秒)
  retriesCount: 1,                     // 重试次数
  maxConcurrentRequests: 50,           // 最大并发数
  maxIntervalMs: 1000,                 // 最大请求间隔
  minIntervalMs: 100,                  // 最小请求间隔
  downloadFolderPath: '',              // 下载文件夹路径
  logLevel: 'info',                    // 日志级别
  enableProgressBar: true,             // 启用进度条
  progressUpdateFrequency: 'realtime', // 进度条更新频率
}
```

## 工具类

### RetryCountdown 重试倒计时工具

位置：`src/utils/RetryCountdown.js`

**功能：**
- 提供优雅的倒计时显示
- 支持自定义颜色和前缀文字
- 自动清理输出行
- 支持异步回调操作

**使用示例：**
```javascript
import { RetryCountdown } from './src/utils/RetryCountdown.js'

// 快速使用
await RetryCountdown.countdown(5, () => {
  console.log('重试操作!')
})

// 自定义样式
await RetryCountdown.countdown(10, async () => {
  await performRetry()
}, {
  prefix: '🔄 自定义重试倒计时',
  color: '\x1b[36m' // 青色
})
```
