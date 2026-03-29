# 豆包生图助手 (Doubao Image Assistant)

![应用截图](screen_shoot.png)

一款专为 Mac/Windows 打造的豆包 (Doubao) AI 绘图辅助管理工具。它能将你的浏览器绘图体验原生化，提供极致丝滑的画廊管理、本地持久化存储以及高级图片处理功能。

## ✨ 核心特性

- 🎨 **原生 UI 体验**：采用极简“积木 (Jimeng)”风格，完美适配 Mac 系统的标题栏 (TitleBar Overlay)。
- 🔗 **实时同步**：通过本地 WebSocket (8081) 实现浏览器与桌面端无缝同步，生成即显示。
- 📦 **本地持久化**：内置 SQLite3 数据库，所有提示词与生成结果永久保存，支持离线翻阅。
- 💎 **高清无水印**：支持直接下载/保存 **高清、无水印** 的原图，完美保存每一处细节。
- 🔌 **API 调用支持**：内置 Express 代理服务，支持以 API 方式调用生图能力，方便二次开发集成。
- 🖼️ **全能画廊**：支持一键复用提示词、设为参考图、批量预览及本地管理。
- 🛠️ **图片处理**：集成原生图片压缩工具，支持预览压缩前后效果。
- 🚀 **自动化发布**：基于 GitHub Actions 实现多平台 (Windows .exe / macOS .dmg) 自动打包。

## 🚀 快速开始

### 1. 安装应用
前往 [Releases](https://github.com/abc-kkk/doubao-image-studio/releases) 页面下载对应系统的安装包：
- **macOS**: 下载 `.dmg` 文件并拖入 Applications。
- **Windows**: 下载 `.exe` 或 `.msi` 文件运行安装。

### 2. 配置浏览器扩展
1. 打开 Chrome/Edge 浏览器，进入 `chrome://extensions/`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择项目根目录下的 `DoubaoShadowNode-local` 文件夹。
4. 确保扩展状态显示为 `Connected`。

### 3. 开始使用
- 启动 **豆包生图助手**。
- 在浏览器打开 [豆包官网](https://www.doubao.com/) 开始生图。
- 你的生成结果将自动出现在桌面端的画廊中。

## 🛠️ 开发指南

项目采用以下技术栈：
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust (Tauri) + Node.js Express (Local Server)
- **Database**: SQLite3 (better-sqlite3)

### 本地运行
1. 安装依赖：
   ```bash
   npm install
   cd server && npm install
   ```
2. 启动开发模式：
   ```bash
   npm run tauri dev
   ```

## ⚖️ 免责声明 (Disclaimer)

1. **用途说明**：本项目仅供 **个人学习**、**技术探讨** 及 **学术交流** 使用。
2. **版权归属**：本项目使用的“豆包”相关接口及品牌归原厂家所有，开发者无意侵犯任何公司或个人的合法权益。
3. **责任限制**：用户需对使用本软件的行为独立承担责任。本软件开发者不保证软件的绝对稳定性，对于因使用本软件造成的任何数据丢失、系统损坏、法律纠纷或其他直接/间接经济损失，**开发者不承担任何形式的法律责任**。
4. **安全提示**：请勿将本软件用于任何违反法律法规及目标网站服务条款的行为。

