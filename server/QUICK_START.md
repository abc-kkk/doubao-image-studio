# 🚀 快速启动指南

## ⚠️ 重要提示

服务器启动后，如果直接测试聊天或图片生成功能，会看到错误：
```
Error: Service Unavailable: No worker for 'doubao-pro'
```

**这是正常的！** 因为需要先加载Chrome扩展并连接豆包页面。

## 📋 完整启动流程

### 步骤1：启动服务器

```bash
cd /Users/ios/Desktop/py-pro/doubao-pro
npm start
```

您会看到：
```
🚀 Doubao AI Studio Server running at: http://0.0.0.0:8080
📱 Web App: http://localhost:8080
🔌 WebSocket: ws://localhost:8080/ws
📊 Health Check: http://localhost:8080/api/health
```

**保持这个终端运行，不要关闭！**

### 步骤2：加载Chrome扩展

1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择目录：`/Users/ios/Desktop/py-pro/doubao-pro/DoubaoShadowNode`
6. 确认扩展已加载（会显示一个扩展卡片）

### 步骤3：打开豆包页面

1. 在Chrome中新建标签页
2. 访问：https://www.doubao.com/chat/
3. 登录您的豆包账号
4. 等待页面完全加载

**查看服务器终端**，您应该会看到：
```
✅ New Worker Connected!
📝 Worker Registered Models: doubao-pro, doubao-pro-image
```

这表示Chrome扩展已成功连接！

### 步骤4：访问Web应用

1. 打开新标签页
2. 访问：http://localhost:8080
3. 您会看到AI Studio的界面

**检查连接状态**：
- 左下角应该显示"已连接 (doubao-pro, doubao-pro-image)"
- 如果显示"未连接"，请返回步骤3检查豆包页面

### 步骤5：开始使用

现在可以测试所有功能了！

#### 测试聊天
1. 点击左侧"智能对话"
2. 选择模型"豆包 Pro"
3. 输入"你好"
4. 点击发送

#### 测试图片生成
1. 点击左侧"图片生成"
2. 选择模型"豆包图像生成"
3. 输入描述："一只可爱的小猫"
4. 点击"生成图片"

## 🔍 故障排除

### 问题1：显示"未连接"

**原因**：Chrome扩展未连接到服务器

**解决方案**：
1. 确认Chrome扩展已加载
2. 确认豆包页面已打开并登录
3. 刷新豆包页面
4. 查看Chrome扩展的背景页日志：
   - 访问 `chrome://extensions/`
   - 找到DoubaoShadowNode扩展
   - 点击"service worker"查看日志

### 问题2：聊天或生图报错"No worker"

**原因**：扩展未注册或未连接

**解决方案**：
1. 按照步骤2-3重新加载扩展和豆包页面
2. 等待服务器终端显示"Worker Registered Models"
3. 刷新Web应用页面

### 问题3：端口8080被占用

**错误信息**：
```
Error: listen EADDRINUSE: address already in use 0.0.0.0:8080
```

**解决方案**：
```bash
# 杀死占用端口的进程
lsof -ti:8080 | xargs kill -9

# 重新启动
npm start
```

### 问题4：图片生成失败

**可能原因**：
1. 豆包账号没有图片生成权限
2. 提示词违反内容政策
3. 网络问题

**解决方案**：
1. 确认豆包账号可以正常生成图片
2. 尝试更简单的提示词
3. 查看服务器和扩展日志

## 📊 验证连接状态

### 方法1：查看Web应用
- 左下角状态指示器应显示绿点
- 文字显示"已连接 (doubao-pro, doubao-pro-image)"

### 方法2：访问健康检查接口
```bash
curl http://localhost:8080/api/health
```

应该返回：
```json
{
  "status": "running",
  "legacyConnected": false,
  "registeredModels": ["doubao-pro", "doubao-pro-image"],
  "pendingTasks": 0,
  "timestamp": "2025-11-23T12:00:00.000Z"
}
```

### 方法3：查看服务器日志
服务器终端应该显示：
```
✅ New Worker Connected!
📝 Worker Registered Models: doubao-pro, doubao-pro-image
```

## 🎯 测试Gemini模型

如果要使用Gemini模型（不需要Chrome扩展）：

1. 在聊天界面选择"Gemini 2.5 Flash"
2. 输入消息并发送
3. 直接通过代理访问Gemini API

**注意**：Gemini模型不需要Chrome扩展，可以直接使用。

## 📝 完整测试清单

- [ ] 服务器启动成功
- [ ] Chrome扩展已加载
- [ ] 豆包页面已打开并登录
- [ ] Web应用显示"已连接"
- [ ] 豆包聊天测试成功
- [ ] 豆包图片生成测试成功
- [ ] Gemini聊天测试成功（可选）
- [ ] 图片库功能正常
- [ ] 参考图选择功能正常

## 🎉 成功标志

当您看到以下情况时，说明一切正常：

1. **服务器终端**：
   ```
   ✅ New Worker Connected!
   📝 Worker Registered Models: doubao-pro, doubao-pro-image
   💬 Chat request: model=db, prompt=你好...
   ```

2. **Web应用**：
   - 左下角绿色状态点
   - 聊天消息正常显示
   - 图片生成成功并保存

3. **图片库**：
   - 显示已生成的图片
   - 可以选择作为参考图
   - 可以删除图片

## 💡 使用技巧

1. **保持豆包页面打开**：Chrome扩展需要豆包页面保持打开状态
2. **多标签页**：可以同时打开多个Web应用标签页
3. **刷新恢复**：如果连接断开，刷新豆包页面即可重连
4. **查看日志**：遇到问题时查看服务器终端和Chrome扩展日志

## 🔄 重启流程

如果需要重启：

1. 停止服务器（Ctrl+C）
2. 重新启动：`npm start`
3. 刷新豆包页面
4. 刷新Web应用页面

---

**准备好了吗？** 按照上面的步骤开始使用吧！🚀
