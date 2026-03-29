# AI Studio - 智能对话与图片生成平台

> 🚀 **全新Web应用已上线！** 现在支持完整的Web界面，包括智能对话、图片生成和图片库管理。

## ✨ 新功能亮点

### 🌐 Web应用（v2.1）
- **智能对话**：支持豆包、Gemini多个模型，**支持参考图**
- **图片生成**：文生图，支持参考图和比例设置
- **图片库**：自动保存，多选管理
- **现代化UI**：深色主题，流畅动画
- **模块化架构**：易于扩展和维护

### 🎨 核心特性
- ✅ 多模型支持（豆包 Pro、Gemini 2.5/2.0/3.0、ModelScope、SiliconFlow）
- ✅ 智能回退机制（Gemini 失败自动切换至 ModelScope）
- ✅ **聊天参考图**（文本对话支持上传图片，可以问"这张图里有什么？"）
- ✅ **图片生成参考图**（支持多张参考图）
- ✅ 图片比例设置（6种比例）
- ✅ 自动保存到本地images文件夹
- ✅ 图片库管理（查看、删除、选择）
- ✅ 实时状态显示
- ✅ 响应式设计

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务器
```bash
# 使用新的Web应用（推荐）
npm start

# 或使用旧版服务器
npm run start:legacy
```

### 3. 加载Chrome扩展
1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 加载 `DoubaoShadowNode` 目录

### 4. 访问应用
- **Web应用**：http://localhost:8080
- **健康检查**：http://localhost:8080/api/health

## 📱 使用说明

### 智能对话
1. 选择AI模型（豆包/Gemini）
2. **（可选）上传参考图**：点击"参考图"或"上传"按钮添加图片
3. 输入消息（例如："这张图里有什么？"）
4. 点击发送或按Enter键
5. 发送后参考图会自动清空

**注意**：目前只有豆包模型支持聊天参考图功能

### 图片生成
1. 选择图像模型
2. 输入图片描述
3. （可选）选择参考图
4. （可选）设置图片比例
5. 点击"生成图片"

### 图片库
- 查看所有已保存的图片
- 多选删除不需要的图片
- 选择图片作为参考图使用（聊天或图片生成）

## 📖 详细文档

- [使用指南](USAGE_GUIDE.md) - 详细的使用说明
- [项目总结](PROJECT_SUMMARY.md) - 完整的项目介绍
- [API文档](API_DOCS.md) - API接口说明
- [优化总结](OPTIMIZATION_SUMMARY.md) - 参考图功能实现

## 🏗️ 项目结构

```
doubao-pro/
├── src/                          # 后端源代码（模块化）
│   ├── app.js                    # 主应用入口
│   ├── services/                 # 服务层
│   ├── controllers/              # 控制器
│   └── routes/                   # 路由
├── public/                       # 前端静态文件
│   ├── index.html                # 主页面
│   ├── css/style.css             # 样式
│   └── js/app.js                 # 前端逻辑
├── images/                       # 图片存储
├── DoubaoShadowNode/             # Chrome扩展
└── index_doubao.js               # 旧版服务器（兼容）
```

## 🔧 技术栈

### 后端
- Node.js + Express.js
- WebSocket (ws)
- ES Modules
- 文件系统存储

### 前端
- Vanilla JavaScript
- Modern CSS (Grid, Flexbox)
- Fetch API
- 无框架依赖

### Chrome扩展
- Manifest V3
- Content Scripts
- Background Service Worker
- API Interception

## 🎨 UI设计

- **主题**：深色主题，护眼舒适
- **颜色**：渐变效果，视觉吸引
- **动画**：流畅过渡，提升体验
- **布局**：响应式，适配各种设备

## 📊 API接口

### 聊天
```bash
POST /api/chat
{
  "model": "db", // 可选: db, mota, ds, hy, g2, g2.5, g3
  "prompt": "你好"
}
```

### 图片生成
```bash
POST /api/images/generate
{
  "model": "db", // 可选: db, mota, g2.5
  "prompt": "一只可爱的小猫",
  "reference_images": ["base64..."],
  "aspect_ratio": "16:9"
}
```

### 图片管理
```bash
GET    /api/images           # 获取所有图片
GET    /api/images/:id       # 获取单个图片
DELETE /api/images/:id       # 删除图片
POST   /api/images/delete-batch  # 批量删除
```

## 🔄 向后兼容

保留了旧版API和服务器，确保现有功能正常运行：
- `/api/unified` - 统一API接口
- `/v1beta/*` - Gemini兼容接口
- `npm run start:legacy` - 启动旧版服务器

---

# Doubao Pro - Chrome Extension 优化

## 项目概述

基于参考项目 [crawler_py](https://github.com/562589540/crawler_py) 的豆包图片生成自动化服务，通过Chrome扩展实现豆包图片生成功能，支持参考图片上传和图片比例设置。

## 新增功能（v1.0）

### ✨ 参考图片支持
- 支持上传多张参考图片（base64格式）
- 自动将base64图片转换为File对象并上传到豆包
- 支持带或不带data URI前缀的base64图片

### 📐 图片比例设置
- 支持多种图片比例：
  - `Auto` - 自动（默认）
  - `1:1` - 正方形
  - `2:3` - 竖版
  - `4:3` - 标准
  - `9:16` - 竖屏
  - `16:9` - 宽屏

## 技术架构

```
┌─────────────────┐
│   Web Client    │ ← 发送请求（prompt + reference_images + aspect_ratio）
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Relay Server   │ ← 中继服务器（index_doubao.js）
│  (Node.js)      │   - 接收HTTP请求
└────────┬────────┘   - 通过WebSocket转发
         │
         ↓
┌─────────────────┐
│ Chrome Extension│ ← Chrome扩展（DoubaoShadowNode）
│  - background.js│   - 接收WebSocket消息
│  - content.js   │   - 操作豆包页面DOM
│  - hook.js      │   - 拦截API响应
└─────────────────┘
```

## 文件结构

```
doubao-pro/
├── DoubaoShadowNode/          # Chrome扩展
│   ├── manifest.json          # 扩展配置
│   ├── background.js          # 后台脚本（WebSocket客户端）
│   ├── content.js             # 内容脚本（DOM操作）✨ 新增参考图和比例功能
│   └── hook.js                # 注入脚本（API拦截）
├── index_doubao.js            # 中继服务器（旧版入口）
├── web_client.html            # 测试客户端（旧版）
├── deploy_doubao.sh           # 部署脚本
├── API_DOCS.md                # API文档 ✨ 更新文档
└── README.md                  # 项目说明
```

## 🤖 ModelScope 集成 (v2.1)

新增了对 ModelScope (魔搭社区) 模型的支持：

### 聊天模型 (`mota`)
- 自动轮询多个高性能模型：
  - Qwen/Qwen3-32B
  - ZhipuAI/GLM-4.6
  - Qwen/Qwen3-Next-80B-A3B-Instruct
  - Qwen/Qwen3-30B-A3B-Instruct-2507
- **智能回退**：当 Gemini API 调用失败时，系统会自动尝试使用 ModelScope 模型作为备选，确保服务高可用。

### 生图模型 (`mota-image`)
- 使用 `Qwen/Qwen-Image` 模型
- 支持高质量文生图

## 🌊 SiliconFlow 集成 (v2.2)

新增了对 SiliconFlow (硅基流动) 模型的支持：

### 聊天模型
- **DeepSeek V3.1** (`ds`): `nex-agi/DeepSeek-V3.1-Nex-N1`
- **Hunyuan 7B** (`hy`): `tencent/Hunyuan-MT-7B`
- **特点**：不限制调用次数，高性能。

## 核心改进

### 1. background.js
```javascript
// 提取参考图片和比例参数
const referenceImages = msg.reference_images_b64 || [];
const aspectRatio = msg.aspect_ratio || 'Auto';

// 传递给content script
chrome.tabs.sendMessage(tabId, {
    type: 'PROMPT',
    text: prompt,
    requestId: msg.requestId,
    isImageMode: isImageMode,
    referenceImages: referenceImages,  // ✨ 新增
    aspectRatio: aspectRatio            // ✨ 新增
});
```

### 2. content.js

#### 新增函数：uploadReferenceImages()
```javascript
async function uploadReferenceImages(referenceImages) {
    // 1. 将base64转换为File对象
    // 2. 使用DataTransfer设置文件
    // 3. 触发change事件上传
}
```

#### 新增函数：setAspectRatio()
```javascript
async function setAspectRatio(ratio) {
    // 1. 点击比例按钮打开下拉菜单
    // 2. 根据比例映射选择对应选项
    // 3. 点击选项设置比例
}
```

#### 更新processPrompt()
```javascript
async function processPrompt(text, requestId, isImageMode, referenceImages, aspectRatio) {
    // 在图片模式下：
    // 1. 触发图像生成模式
    // 2. 上传参考图片（如果有）✨
    // 3. 设置图片比例（如果指定）✨
    // 4. 发送提示词
}
```

### 3. index_doubao.js
```javascript
// 支持新参数
message = JSON.stringify({
    type: 'GENERATE',
    requestId: id,
    model: cleanModelName,
    contents: req.body.contents,
    config: req.body.generationConfig,
    reference_images_b64: req.body.reference_images_b64 || [],  // ✨
    aspect_ratio: req.body.aspect_ratio || 'Auto'               // ✨
});
```

## API使用示例

### 基础图片生成
```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "image_generation",
    "model": "db",
    "prompt": "一只赛博朋克风格的可爱小猫",
    "reference_images": [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQAB..."
    ]
  }'
```

### 带参考图和比例的图片生成
```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "image_generation",
    "model": "db",
    "prompt": "一只赛博朋克风格的可爱小猫，参考这些图片的风格",
    "reference_images": [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQAB..."
    ],
    "aspect_ratio": "16:9"
  }'
```

## 部署说明

1. **安装依赖**
```bash
npm install
```

2. **启动中继服务器**
```bash
node index_doubao.js
# 或使用PM2
pm2 start index_doubao.js --name doubao-relay
```

3. **加载Chrome扩展**
- 打开 Chrome 扩展管理页面 `chrome://extensions/`
- 启用"开发者模式"
- 点击"加载已解压的扩展程序"
- 选择 `DoubaoShadowNode` 目录

4. **打开豆包页面**
- 访问 https://www.doubao.com/chat/
- 登录账号
- 扩展会自动连接到中继服务器

5. **测试功能**
- 打开 `web_client.html` 测试客户端
- 或使用curl命令测试API

## 参考项目特性对比

| 功能 | crawler_py (Python) | doubao-pro (Chrome Extension) |
|------|---------------------|-------------------------------|
| 参考图片上传 | ✅ 支持多张 | ✅ 支持多张 |
| 图片比例设置 | ✅ 5种比例 | ✅ 5种比例 |
| 技能自动选择 | ✅ | ✅ |
| 多实例并发 | ✅ | ❌ (单实例) |
| 浏览器管理界面 | ✅ | ❌ |
| 实现方式 | Playwright自动化 | Chrome扩展DOM操作 |

## 优势

1. **轻量级**：Chrome扩展比完整的浏览器自动化更轻量
2. **实时性**：直接在用户浏览器中运行，无需额外浏览器实例
3. **稳定性**：利用Chrome扩展API，比模拟操作更稳定
4. **兼容性**：完全兼容参考项目的API接口

## 后续优化方向

1. ✅ 参考图片支持（已完成）
2. ✅ 图片比例设置（已完成）
3. ✅ Web应用界面（已完成 v2.0）
4. ⏳ 多实例并发支持
5. ⏳ 浏览器管理界面
6. ⏳ 错误重试机制优化
7. ⏳ 图片下载进度反馈

## 许可证

MIT License
