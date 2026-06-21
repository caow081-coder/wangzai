/**
 * 旺财 UI Actuation Layer — Electron BrowserView 平台嵌入
 *
 * 路线B: 用 Electron BrowserView 加载各平台网页版
 * + DOM 注入 (preload) 实现消息读取/发送/评论截流
 *
 * 支持平台:
 *  - 微信网页版 (wx.qq.com)
 *  - 抖音网页版 (douyin.com)
 *  - 视频号 (channels.weixin.qq.com)
 *
 * 架构:
 *  BrowserView 加载平台 → preload.js 注入 → DOM 监听 → 消息提取 → 事件总线
 */

const { BrowserView, BrowserWindow } = require('electron')
const path = require('path')

// 平台配置
const PLATFORMS = {
  wechat: {
    name: '微信',
    url: 'https://wx.qq.com/',
    icon: '💬',
    preloadScript: 'wechat-preload.js',
    // DOM 选择器配置 (可被 UI 自愈系统更新)
    selectors: {
      chatList: '.chat-list .chat-item',
      activeChat: '.chat-item.active',
      messageList: '.message-list .message',
      inputBox: '.edit-area',
      sendBtn: '.send-btn',
      contactName: '.nickname',
      messageText: '.message-content .text',
      messageSender: '.message-sender',
    },
  },
  douyin: {
    name: '抖音',
    url: 'https://www.douyin.com/',
    icon: '🎵',
    preloadScript: 'douyin-preload.js',
    selectors: {
      commentList: '.comment-item',
      commentText: '.comment-text',
      commentUser: '.comment-user .name',
      videoTitle: '.video-title',
      videoPlayCount: '.video-play-count',
      dmButton: '.dm-button',
      dmInput: '.dm-input',
      dmSend: '.dm-send',
    },
  },
  video: {
    name: '视频号',
    url: 'https://channels.weixin.qq.com/',
    icon: '📹',
    preloadScript: 'video-preload.js',
    selectors: {
      commentList: '.comment-item',
      commentText: '.comment-content',
      commentUser: '.comment-username',
      videoTitle: '.video-info-title',
      videoPlayCount: '.video-info-views',
      dmButton: '.message-btn',
    },
  },
}

// 存储所有 BrowserView 实例
const views = new Map()

/**
 * 创建平台 BrowserView
 */
function createPlatformView(parentWindow, platformId) {
  const config = PLATFORMS[platformId]
  if (!config) return null

  // 如果已存在，先销毁
  if (views.has(platformId)) {
    destroyPlatformView(platformId)
  }

  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preloads', config.preloadScript),
      contextIsolation: true,
      nodeIntegration: false,
      partition: `persist:${platformId}`,  // 每平台独立 session
    },
  })

  parentWindow.addBrowserView(view)
  view.setBounds({ x: 60, y: 0, width: 800, height: 600 })
  view.setAutoResize({ width: true, height: true })

  // 加载平台 URL
  view.webContents.loadURL(config.url)

  // 监听 DOM 事件 (通过 preload 注入)
  view.webContents.on('dom-ready', () => {
    console.log(`[${config.name}] DOM 已加载`)
    // 注入事件监听脚本
    view.webContents.executeJavaScript(`
      ;(() => {
        const PLATFORM = '${platformId}';
        const SELECTORS = ${JSON.stringify(config.selectors)};
        
        // 消息监听
        function observeMessages() {
          const msgList = document.querySelector(SELECTORS.messageList || SELECTORS.commentList);
          if (!msgList) return;
          
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                const textEl = node.querySelector(SELECTORS.messageText || SELECTORS.commentText);
                const senderEl = node.querySelector(SELECTORS.messageSender || SELECTORS.commentUser);
                if (textEl) {
                  const eventData = {
                    type: 'message',
                    platform: PLATFORM,
                    text: textEl.textContent?.trim() || '',
                    sender: senderEl?.textContent?.trim() || '',
                    timestamp: Date.now(),
                  };
                  window.__wangcaiEvent?.(eventData);
                }
              });
            });
          });
          
          observer.observe(msgList, { childList: true, subtree: true });
          console.log('[' + PLATFORM + '] 消息监听已启动');
        }
        
        // 等待 DOM 加载完成
        setTimeout(observeMessages, 2000);
        
        // 暴露给主进程的 API
        window.__wangcaiSend = async function(text) {
          const input = document.querySelector(SELECTORS.inputBox || SELECTORS.dmInput);
          const sendBtn = document.querySelector(SELECTORS.sendBtn || SELECTORS.dmSend);
          if (!input || !sendBtn) return { success: false, error: '找不到输入框' };
          
          // 模拟输入
          input.focus();
          input.textContent = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          
          // 模拟人类延迟
          await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
          
          // 点击发送
          sendBtn.click();
          return { success: true };
        };
        
        // 读取当前消息列表
        window.__wangcaiReadMessages = function() {
          const msgs = document.querySelectorAll(SELECTORS.messageList || SELECTORS.commentList);
          return Array.from(msgs).map(el => ({
            text: el.querySelector(SELECTORS.messageText || SELECTORS.commentText)?.textContent?.trim() || '',
            sender: el.querySelector(SELECTORS.messageSender || SELECTORS.commentUser)?.textContent?.trim() || '',
          }));
        };
        
        // 读取评论列表 (视频号/抖音)
        window.__wangcaiReadComments = function() {
          const comments = document.querySelectorAll(SELECTORS.commentList);
          return Array.from(comments).map(el => {
            const text = el.querySelector(SELECTORS.commentText)?.textContent?.trim() || '';
            const user = el.querySelector(SELECTORS.commentUser)?.textContent?.trim() || '';
            return { text, user, element: el };
          });
        };
        
        // 点击私信按钮 (截流)
        window.__wangcaiClickDM = function(userElement) {
          const dmBtn = userElement?.querySelector(SELECTORS.dmButton);
          if (dmBtn) {
            dmBtn.click();
            return true;
          }
          return false;
        };
        
        console.log('[' + PLATFORM + '] 旺财 preload 注入完成');
      })();
    `).catch(err => console.error(`[${config.name}] 注入失败:`, err))
  })

  views.set(platformId, { view, config, parentWindow })
  console.log(`[${config.name}] BrowserView 已创建`)

  return view
}

/**
 * 调整 BrowserView 大小
 */
function resizeView(platformId, bounds) {
  const entry = views.get(platformId)
  if (entry) {
    entry.view.setBounds(bounds)
  }
}

/**
 * 显示/隐藏 BrowserView
 */
function showView(platformId, visible) {
  const entry = views.get(platformId)
  if (!entry) return

  if (visible) {
    entry.parentWindow.addBrowserView(entry.view)
  } else {
    entry.parentWindow.removeBrowserView(entry.view)
  }
}

/**
 * 销毁 BrowserView
 */
function destroyPlatformView(platformId) {
  const entry = views.get(platformId)
  if (!entry) return

  entry.parentWindow.removeBrowserView(entry.view)
  entry.view.webContents.destroy()
  views.delete(platformId)
  console.log(`[${entry.config.name}] BrowserView 已销毁`)
}

/**
 * 向平台发送消息
 */
async function sendToPlatform(platformId, text) {
  const entry = views.get(platformId)
  if (!entry) return { success: false, error: '平台未加载' }

  try {
    const result = await entry.view.webContents.executeJavaScript(
      `window.__wangcaiSend(${JSON.stringify(text)})`
    )
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * 读取平台消息
 */
async function readMessages(platformId) {
  const entry = views.get(platformId)
  if (!entry) return []

  try {
    return await entry.view.webContents.executeJavaScript(
      `window.__wangcaiReadMessages()`
    )
  } catch {
    return []
  }
}

/**
 * 读取评论 (视频号/抖音截流)
 */
async function readComments(platformId) {
  const entry = views.get(platformId)
  if (!entry) return []

  try {
    return await entry.view.webContents.executeJavaScript(
      `window.__wangcaiReadComments()`
    )
  } catch {
    return []
  }
}

/**
 * 截流: 点击用户私信
 */
async function clickDM(platformId, userIndex) {
  const entry = views.get(platformId)
  if (!entry) return false

  try {
    return await entry.view.webContents.executeJavaScript(
      `(() => {
        const comments = document.querySelectorAll('${entry.config.selectors.commentList}');
        const target = comments[${userIndex}];
        if (target) return window.__wangcaiClickDM(target);
        return false;
      })()`
    )
  } catch {
    return false
  }
}

/**
 * UI 自愈: 重新检测 DOM 选择器
 */
async function selfHealSelectors(platformId) {
  const entry = views.get(platformId)
  if (!entry) return null

  try {
    const result = await entry.view.webContents.executeJavaScript(`
      (() => {
        const results = {};
        // 尝试多种选择器找到关键元素
        const tryFind = (keys, candidates) => {
          for (const c of candidates) {
            const el = document.querySelector(c);
            if (el) return c;
          }
          return null;
        };
        
        results.messageList = tryFind('messageList', [
          '.message-list .message', '.chat-content .message',
          '.message-list', '.chat-messages', '[class*="message"]',
        ]);
        results.inputBox = tryFind('inputBox', [
          '.edit-area', '.chat-input', 'textarea[class*="input"]',
          '[contenteditable="true"]', '[class*="input-area"]',
        ]);
        results.sendBtn = tryFind('sendBtn', [
          '.send-btn', '.btn-send', 'button[class*="send"]',
          '[class*="send-btn"]', 'button:last-child',
        ]);
        
        return results;
      })()
    `)
    console.log(`[${entry.config.name}] UI 自愈检测结果:`, result)
    return result
  } catch (err) {
    console.error(`[${entry.config.name}] UI 自愈失败:`, err)
    return null
  }
}

module.exports = {
  PLATFORMS,
  createPlatformView,
  resizeView,
  showView,
  destroyPlatformView,
  sendToPlatform,
  readMessages,
  readComments,
  clickDM,
  selfHealSelectors,
}
