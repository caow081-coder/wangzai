/**
 * 旺财微信 preload — 注入到微信网页版
 *
 * 监听消息 + 暴露发送 API + 暴露读取 API
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__wangcai', {
  platform: 'wechat',
  version: '1.0.0',
})

// 消息事件回调
let messageCallback = null

contextBridge.exposeInMainWorld('__wangcaiEvent', (data) => {
  if (messageCallback) messageCallback(data)
})

contextBridge.exposeInMainWorld('__wangcaiSetCallback', (cb) => {
  messageCallback = cb
})
