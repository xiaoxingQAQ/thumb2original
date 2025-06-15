import { validateAndModifyFileName } from '../utils/file/validateAndModifyFileName.js'
import path from 'path'
import fs from 'fs'

/**
 * 图片提取器
 * 负责页面加载、滚动、图片查找（保留原有逻辑）
 */
export class ImageExtractor {
  constructor(config, logger) {
    this.config = config
    this.logger = logger
    this.browser = null
    this.title = ''
    this.currentUrl = ''
    this.targetDownloadFolderPath = ''
    // 用于控制下载行为设置日志的显示
    this._downloadBehaviorLogged = false
  }

  /**
   * 设置浏览器实例
   * @param {Object} browser Puppeteer浏览器实例
   */
  setBrowser(browser) {
    this.browser = browser
  }

  /**
   * 创建并配置新的浏览器页面
   * @param {Object} options - 页面配置选项
   * @param {boolean} options.setReferer - 是否设置空的 Referer 头
   * @returns {Promise<Page>} 配置好的页面实例
   */
  async createPage(options = {}) {
    const { setReferer = false } = options

    try {
      // 创建新页面
      const page = await this.browser.newPage()

      // 设置标准视口大小
      await page.setViewport(this.config.browser?.viewport || { width: 1920, height: 1080 })

      // 根据需要设置请求头
      if (setReferer) {
        await page.setExtraHTTPHeaders({
          Referer: '',
        })
      }

      // 🛡️ 三层防护体系第二层：页面级防下载设置
      try {
        // 使用Chrome DevTools Protocol正确设置页面下载行为
        const client = await page.target().createCDPSession()
        await client.send('Page.setDownloadBehavior', {
          behavior: 'deny',
        })
        // 只在第一次设置时显示信息，避免重复日志
        if (!this._downloadBehaviorLogged) {
          this.logger.info('🛡️ 页面下载行为已设置为拒绝（后续页面创建将静默设置）')
          this._downloadBehaviorLogged = true
        }
      } catch (error) {
        // 如果设置失败，记录debug信息但不影响程序继续执行
        this.logger.debug('设置页面下载行为失败（可能浏览器版本不支持）:', error.message)
      }

      // 🔥 关键修复：启用请求拦截以阻止直接下载
      await page.setRequestInterception(true)
      page.on('request', (request) => {
        const url = request.url()
        const resourceType = request.resourceType()

        // 允许图片请求，但阻止可能触发下载的请求
        if (resourceType === 'image') {
          // 检查是否是直接触发下载的图片请求
          const headers = request.headers()
          if (headers['content-disposition'] && headers['content-disposition'].includes('attachment')) {
            this.logger.debug('阻止下载触发的图片请求:', url)
            request.abort()
            return
          }
          // 正常的图片请求继续
          request.continue()
        } else if (resourceType === 'document' && url.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg|tiff)$/i)) {
          // 阻止作为文档加载的图片（这通常会触发下载）
          this.logger.debug('阻止作为文档的图片请求:', url)
          request.abort()
        } else {
          // 其他请求正常继续
          request.continue()
        }
      })

      // 🛡️ 三层防护体系第三层：文档级防下载脚本
      await page.evaluateOnNewDocument(() => {
        // 阻止默认的下载行为，但不影响图片加载
        Object.defineProperty(HTMLAnchorElement.prototype, 'download', {
          get() {
            return ''
          },
          set() {
            return false
          },
        })

        // 阻止location.href的下载触发
        const originalHref = Object.getOwnPropertyDescriptor(Location.prototype, 'href')
        Object.defineProperty(Location.prototype, 'href', {
          get: originalHref.get,
          set: function (value) {
            // 检查是否是下载链接
            if (
              typeof value === 'string' &&
              (value.startsWith('blob:') ||
                value.includes('download=') ||
                value.match(/\.(zip|rar|exe|msi|dmg|pkg|tar|gz|7z|pdf|doc|docx|xls|xlsx)$/i))
            ) {
              console.warn('阻止下载链接:', value)
              return false
            }
            return originalHref.set.call(this, value)
          },
          configurable: true,
        })

        // 阻止文件下载确认对话框
        window
          .addEventListener('beforeunload', (e) => {
            e.preventDefault()
            e.returnValue = ''
          })

          [
            // 阻止下载相关事件
            ('click', 'contextmenu')
          ].forEach((eventType) => {
            document.addEventListener(
              eventType,
              (e) => {
                const target = e.target
                if (target && target.tagName === 'A') {
                  const href = target.getAttribute('href')
                  const download = target.getAttribute('download')

                  // 如果是下载链接，阻止默认行为
                  if (
                    download !== null ||
                    (href &&
                      (href.startsWith('blob:') ||
                        href.includes('download=') ||
                        href.match(/\.(zip|rar|exe|msi|dmg|pkg|tar|gz|7z|pdf|doc|docx|xls|xlsx)$/i)))
                  ) {
                    e.preventDefault()
                    e.stopPropagation()
                    console.warn('阻止下载链接点击:', href)
                    return false
                  }
                }
              },
              true
            )
          })
      })

      return page
    } catch (error) {
      this.logger.debug('创建页面失败', error) // 改为debug级别，避免与Crawler层重复记录
      throw error
    }
  }

  /**
   * 设置目标下载路径
   * 统一管理下载文件夹路径的设置逻辑
   * @returns {string} 设置后的目标下载路径
   */
  setTargetDownloadPath() {
    try {
      const downloadFolderPath = this.config.downloadFolderPath
      const rootDownloadDir = 'download'

      // 确保根下载目录 'download' 存在
      if (!fs.existsSync(rootDownloadDir)) {
        fs.mkdirSync(rootDownloadDir)
        this.logger.info(`根下载目录 '${rootDownloadDir}' 已创建`)
      }

      if (downloadFolderPath) {
        // 使用用户指定的下载路径
        this.targetDownloadFolderPath = downloadFolderPath
      } else {
        // 根据网页标题生成默认下载路径
        const sanitizedTitle = validateAndModifyFileName(this.title || 'untitled')
        // 使用 path.join 安全地构建路径
        this.targetDownloadFolderPath = path.join(rootDownloadDir, sanitizedTitle)
      }

      this.logger.debug(`设置下载路径: ${this.targetDownloadFolderPath}`)
      return this.targetDownloadFolderPath
    } catch (error) {
      this.logger.error('设置下载路径失败', error)
      // 使用默认路径作为 fallback
      this.targetDownloadFolderPath = path.join('download', 'default')
      return this.targetDownloadFolderPath
    }
  }

  /**
   * 加载页面
   * @param {object} page Puppeteer页面对象
   * @param {string} url 要加载的URL
   * @returns {Promise<void>}
   */
  async loadPage(page, url) {
    this.currentUrl = url

    try {
      // 设置访问图像的超时时间
      const timeoutMilliseconds = this.config.timeouts?.pageLoad || 30000

      // 导航到您想要获取HTML的网址
      await page.goto(this.currentUrl, {
        // FIXME: 测试阶段，先使用 load，后续再使用domcontentloaded
        // waitUntil: 'networkidle0',
        waitUntil: 'load',
        timeout: timeoutMilliseconds,
      })

      // 获取页面标题
      this.title = await page.title()
      this.logger.info(`网页标题: ${this.title}`)
    } catch (error) {
      this.logger.debug('页面加载失败', error) // 改为debug级别，避免与Crawler层重复记录
      throw error
    }

    // 等待2秒
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  /**
   * 向下滚动页面
   * @param {object} page Puppeteer页面对象
   * @returns {Promise<void>}
   */
  async scrollPage(page) {
    const scrollConfig = this.config.scroll || {}

    await page.evaluate(async (scrollOptions) => {
      // 异步滚动函数，接受一个参数：最大已滚动距离
      async function autoScroll(maxScroll, timeout = 3000) {
        return new Promise((resolve) => {
          let lastScrollTime = Date.now() // 记录最后一次滚动的时间
          window.onscroll = () => {
            // 监听滚动事件
            lastScrollTime = Date.now() // 更新最后一次滚动的时间
            // 如果还在滚动，就更新最后一次滚动的时间，并设置停止标志为假
            isStop = false
          }
          // 获取当前已滚动的距离
          let currentScroll = window.scrollY
          // 设置一个标志，表示是否停止滚动
          let isStop = false
          // 设置一个计时器，用于检测滚动停留时间
          let timer = null
          // 定义一个内部函数，用于执行滚动操作
          function scroll() {
            // 如果超过最大已滚动距离或者停止滚动，就停止滚动，并执行回调函数
            if (currentScroll >= maxScroll || isStop) {
              // 自动滚动完成 (在页面上下文中无法使用logger)
              clearInterval(timer)
              return resolve()
            }
            // 每次滚动一定的像素
            window.scrollBy(0, scrollOptions.stepSize)
            // 更新已滚动的距离
            currentScroll = window.scrollY
            // 检测是否停止滚动
            if (Date.now() - lastScrollTime > timeout) {
              // 如果超时没有滚动，就设置停止标志为真
              isStop = true
            }
            // 设置一个定时器，继续滚动
            timer = setTimeout(scroll, 100)
          }
          // 调用内部函数开始滚动
          scroll()
        })
      }

      // 调用异步函数，传入配置的最大已滚动距离
      await autoScroll(scrollOptions.maxDistance, scrollOptions.stopTimeout)
    }, scrollConfig)
  }

  /**
   * 查找页面中的图像
   * @param {object} page Puppeteer页面对象
   * @returns {Promise<Array>} 图像URL数组
   */
  async findImages(page) {
    // 设置下载文件夹路径
    this.setTargetDownloadPath()

    // 使用标准 URL 构造函数提取 origin
    const origin = new URL(this.currentUrl).origin

    let images = await page.evaluate((origin) => {
      const elementArray = ['a', 'img', 'svg', 'use', 'meta', 'link', 'figure']

      const elements = Array.from(document.querySelectorAll('img')) // 获取所有的 a 和 img 元素
      return elements
        .map((element) => {
          if (element.tagName === 'A') {
            let url = element.getAttribute('href')
            if (!url) return null

            url = handleImageUrl(url, origin)
            if (isImageUrl(url)) return url
          } else if (element.tagName === 'IMG') {
            let url = element.getAttribute('src')
            if (!url) return null

            url = handleImageUrl(url, origin)
            return url
          }
          return null // 返回 null 表示不是图像链接
        })
        .filter((url) => url != null)

      function handleImageUrl(url, origin) {
        if (origin.includes('http://asiantgp.net')) {
          const prefix = 'http://asiantgp.net/gallery/Japanese_cute_young_wife_Haruka'
          return prefix + '/' + url
        } else if (!url.startsWith('http')) {
          return (url = `${origin}` + url)
        } else {
          return url
        }
      }

      /**
       * 是否为图像链接
       * @param {string} url
       * @returns
       */
      function isImageUrl(url) {
        // 定义一个正则表达式，匹配以常见图像文件扩展名结尾的字符串
        let regex = /(https?:\/\/).*\.(jpg|jpeg|png|gif|bmp|webp|svg|tiff)$/i // 使用不区分大小写的标志 'i'
        // 调用test()方法，检查url是否符合正则表达式
        return regex.test(url)
      }
    }, origin)

    // 使用 Set 去重
    images = Array.from(new Set(images))

    this.logger.debug('提取的图像', images)
    this.logger.info(`提取的图像的个数: ${images.length}`)

    return images
  }

  /**
   * 获取原图URL (downloadOriginImagesByThumbnails模式)
   * @param {object} page Puppeteer页面对象
   * @param {Array} thumbnailImages 缩略图URL数组
   * @returns {Promise<Array>} 原图URL数组
   */
  async getOriginalImageUrls(page, thumbnailImages) {
    const currentUrl = this.currentUrl
    let originalImageUrls = []

    if (currentUrl.includes('https://www.eroticbeauties.net')) {
      // 使用 page.evaluate 方法在页面上下文中执行 JavaScript 代码
      originalImageUrls = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span.jpg')) // 获取页面中所有具有 "jpg" 类名的 <span> 元素

        // 使用 Array.map 方法获取每个 <span> 元素的 data-src 属性的值
        const dataSrcValues = spans.map((span) => span.getAttribute('data-src'))

        return dataSrcValues
      })
    } else if (currentUrl.includes('http://www.alsasianporn.com')) {
      originalImageUrls = await page.evaluate(() => {
        const as = Array.from(document.querySelectorAll('a[data-fancybox="gallery"]')) // 获取页面中所有具有 "jpg" 类名的 <span> 元素

        // 使用 Array.map 方法获取每个 <span> 元素的 data-src 属性的值
        const hrefValues = as.map((span) => span.getAttribute('href'))

        return hrefValues
      })
    } else if (
      currentUrl.includes('https://www.japanesesexpic.me') ||
      currentUrl.includes('http://www.asianpussypic.me')
    ) {
      originalImageUrls = await page.evaluate(() => {
        const as = Array.from(document.querySelectorAll('a[target="_blank"]')) // 获取页面中所有具有 "jpg" 类名的 <span> 元素

        // 使用 Array.map 方法获取每个 <span> 元素的 data-src 属性的值
        const hrefValues = as.map((span) => span.getAttribute('href'))

        return hrefValues
      })
    } else if (currentUrl.includes('https://chpic.su')) {
      // 处理 chpic.su 的情况 - 使用工具函数生成原图URL
      const { generateOriginalImageUrl } = await import('./image/generateOriginalImageUrl.js')

      originalImageUrls = thumbnailImages
        .map((imageUrl) => generateOriginalImageUrl(imageUrl, 'transparent'))
        .filter((imageUrl) => imageUrl !== '')

      const originalImageUrlsOtherTypes = thumbnailImages
        .map((imageUrl) => generateOriginalImageUrl(imageUrl, 'white'))
        .filter((imageUrl) => imageUrl !== '')

      originalImageUrls.push(...originalImageUrlsOtherTypes)
    } else if (this._containsRestrictedWords(currentUrl)) {
      originalImageUrls = await page.evaluate((currentUrl) => {
        const imgEls = Array.from(document.querySelectorAll('img'))

        const srcValues = imgEls.map((el) => {
          const srcValue = el.getAttribute('src')
          if (!srcValue.includes('tn_')) return ''
          return currentUrl.split('?')[0] + srcValue.replace('tn_', '')
        })

        return srcValues
      }, currentUrl)
    } else {
      // 默认情况：使用工具函数生成原图URL
      const { generateOriginalImageUrl } = await import('./image/generateOriginalImageUrl.js')

      originalImageUrls = thumbnailImages
        .map((imageUrl) => generateOriginalImageUrl(imageUrl))
        .filter((imageUrl) => imageUrl !== '')
    }

    originalImageUrls = originalImageUrls.filter((imageUrl) => imageUrl !== '')

    this.logger.debug('originalImageUrls: ', originalImageUrls)
    this.logger.info(`原图 URL 数量: ${originalImageUrls.length}`)

    return originalImageUrls
  }

  /**
   * 检查URL是否包含受限关键词
   * @param {string} str URL字符串
   * @returns {boolean} 是否包含受限关键词
   * @private
   */
  _containsRestrictedWords(str) {
    const restrictedWords = [
      'theasianpics',
      'asiansexphotos',
      'asianmatureporn',
      'asianamateurgirls',
      'hotasianamateurs',
      'amateurchinesepics',
      'asiannudistpictures',
      'filipinahotties',
      'chinesesexphotos',
      'japaneseteenpics',
      'hotnudefilipinas',
      'asianteenpictures',
      'asianteenphotos',
      'chineseteenpics',
      'cuteasians',
      'amateurasianpictures',
      'chinesexxxpics',
      'sexyasians',
      'allasiansphotos',
      'chinese-girlfriends',
      'chinesegirlspictures',
      'chinese-sex.xyz',
      'asian-cuties-online',
      'japaneseamateurpics',
      'asiangalleries',
      'filipinapornpictures',
      'japanesenudities',
      'koreanpornpics',
      'filipinanudes',
      'chinesepornpics',
      'asianamatures',
      'nudehotasians',
      'asianpornpictures',
      'orientgirlspictures',
    ]

    return restrictedWords.some((word) => str.includes(word))
  }

  /**
   * 获取页面标题
   * @returns {string} 页面标题
   */
  getTitle() {
    return this.title
  }

  /**
   * 获取当前URL
   * @returns {string} 当前URL
   */
  getCurrentUrl() {
    return this.currentUrl
  }

  /**
   * 获取目标下载路径
   * @returns {string} 目标下载路径
   */
  getTargetDownloadPath() {
    return this.targetDownloadFolderPath
  }
}
