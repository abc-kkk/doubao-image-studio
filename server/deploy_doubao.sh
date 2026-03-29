#!/bin/bash

# 服务器配置
SERVER_IP="115.190.228.12"
USER="root"
REMOTE_DIR="/root/doubao-server"

echo "🚀 开始部署 AI Studio (Doubao Pro) 服务..."

# 1. 准备部署包
echo "🗜️ 打包部署文件..."
# 包含 src, public, images, package.json, config.json
# 注意：images 目录包含本地图片和元数据
tar -czf deploy_doubao.tar.gz src public images package.json config.json

# 2. 传输文件
echo "📤 上传文件到服务器 ($SERVER_IP)..."
echo "⚠️ 如果提示输入密码，请输入: smalldu223A"

# 创建远程目录
ssh $USER@$SERVER_IP "mkdir -p $REMOTE_DIR"

# 上传压缩包
scp deploy_doubao.tar.gz $USER@$SERVER_IP:$REMOTE_DIR/

# 3. 远程执行部署
echo "🔧 在服务器上执行安装和重启..."
ssh $USER@$SERVER_IP "cd $REMOTE_DIR && \
    echo '解压文件...' && \
    tar -xzf deploy_doubao.tar.gz && \
    echo '安装依赖...' && \
    npm install --production --registry=https://registry.npmmirror.com && \
    echo '检查 PM2...' && \
    if ! command -v pm2 &> /dev/null; then \
        npm install -g pm2; \
    fi && \
    echo '重启服务...' && \
    echo '重启服务...' && \
    (pm2 delete doubao-server || true) && \
    (pm2 delete doubao-server || true) && \
    pm2 start src/app.js --name doubao-server"

# 4. 清理本地文件
rm deploy_doubao.tar.gz

echo "✅ 部署完成！"
echo "🌍 服务运行在: http://$SERVER_IP:8080"
