/**
 * 旺财视频号 preload — 注入到视频号网页版
 *
 * 监听评论 + 高意向识别 + 私信截流
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__wangcai', {
  platform: 'video',
  version: '1.0.0',
})

let commentCallback = null

contextBridge.exposeInMainWorld('__wangcaiEvent', (data) => {
  if (commentCallback) commentCallback(data)
})

contextBridge.exposeInMainWorld('__wangcaiSetCallback', (cb) => {
  commentCallback = cb
})
