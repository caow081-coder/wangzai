/**
 * 旺财抖音 preload — 注入到抖音网页版
 *
 * 监听评论 + 暴露私信 API + 暴露评论读取 API
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__wangcai', {
  platform: 'douyin',
  version: '1.0.0',
})

let commentCallback = null

contextBridge.exposeInMainWorld('__wangcaiEvent', (data) => {
  if (commentCallback) commentCallback(data)
})

contextBridge.exposeInMainWorld('__wangcaiSetCallback', (cb) => {
  commentCallback = cb
})
