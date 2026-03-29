/**
 * AI Studio - Main Application
 */

// API Configuration
const API_BASE = window.location.origin;

// State Management
const state = {
    currentTab: 'chat',
    selectedImages: new Set(),
    referenceImages: new Set(),
    chatReferenceImages: new Set(), // 聊天参考图
    chatHistory: [],
    generatedImages: []
};

// DOM Elements
const elements = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Status
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    galleryCount: document.getElementById('gallery-count'),

    // Chat
    chatModel: document.getElementById('chat-model'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    chatSend: document.getElementById('chat-send'),
    chatSelectFromGalleryBtn: document.getElementById('chat-select-from-gallery-btn'),
    chatUploadLocalBtn: document.getElementById('chat-upload-local-btn'),
    chatLocalFileInput: document.getElementById('chat-local-file-input'),
    chatReferenceCount: document.getElementById('chat-reference-count'),
    chatReferencePreview: document.getElementById('chat-reference-preview'),
    deleteCurrentConvBtn: document.getElementById('delete-current-conv-btn'),
    deleteAllConvBtn: document.getElementById('delete-all-conv-btn'),

    // Image Generation
    imageModel: document.getElementById('image-model'),
    imagePrompt: document.getElementById('image-prompt'),
    aspectRatio: document.getElementById('aspect-ratio'),
    selectFromGalleryBtn: document.getElementById('select-from-gallery-btn'),
    uploadLocalBtn: document.getElementById('upload-local-btn'),
    localFileInput: document.getElementById('local-file-input'),
    referenceCount: document.getElementById('reference-count'),
    referencePreview: document.getElementById('reference-preview'),
    generateBtn: document.getElementById('generate-btn'),
    generationResults: document.getElementById('generation-results'),
    clearResultsBtn: document.getElementById('clear-results-btn'),

    // Gallery
    galleryGrid: document.getElementById('gallery-grid'),
    refreshGalleryBtn: document.getElementById('refresh-gallery-btn'),
    deleteSelectedBtn: document.getElementById('delete-selected-btn'),

    // Modal
    referenceModal: document.getElementById('reference-modal'),
    modalGallery: document.getElementById('modal-gallery'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalConfirm: document.getElementById('modal-confirm'),

    // Image Preview Modal
    imagePreviewModal: document.getElementById('image-preview-modal'),
    previewImg: document.getElementById('preview-img'),
    previewClose: document.getElementById('preview-close'),
    previewDownload: document.getElementById('preview-download'),

    // Loading
    loadingOverlay: document.getElementById('loading-overlay')
};

// ===== Initialization =====
async function init() {
    setupEventListeners();
    await checkServerStatus();
    await loadGallery();

    // Auto-resize chat input
    elements.chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // Chat
    elements.chatSend.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    elements.chatSelectFromGalleryBtn.addEventListener('click', openChatReferenceModal);
    elements.chatUploadLocalBtn.addEventListener('click', () => elements.chatLocalFileInput.click());
    elements.chatLocalFileInput.addEventListener('change', handleChatLocalImageUpload);
    elements.deleteCurrentConvBtn.addEventListener('click', deleteCurrentConversation);
    elements.deleteAllConvBtn.addEventListener('click', deleteAllConversations);

    // Image Generation
    elements.selectFromGalleryBtn.addEventListener('click', openReferenceModal);
    elements.uploadLocalBtn.addEventListener('click', () => elements.localFileInput.click());
    elements.localFileInput.addEventListener('change', handleLocalImageUpload);
    elements.generateBtn.addEventListener('click', generateImage);
    elements.clearResultsBtn.addEventListener('click', clearResults);

    // Gallery
    elements.refreshGalleryBtn.addEventListener('click', loadGallery);
    // Modal
    elements.modalClose.addEventListener('click', closeReferenceModal);
    elements.modalCancel.addEventListener('click', closeReferenceModal);
    elements.modalConfirm.addEventListener('click', confirmReferenceSelection);
    elements.referenceModal.addEventListener('click', (e) => {
        if (e.target === elements.referenceModal) closeReferenceModal();
    });

    // Image Preview
    elements.previewClose.addEventListener('click', closeImagePreview);
    elements.imagePreviewModal.addEventListener('click', (e) => {
        if (e.target === elements.imagePreviewModal) {
            closeImagePreview();
        }
    });

    // Gallery
    elements.refreshGalleryBtn.addEventListener('click', loadGallery);
    elements.deleteSelectedBtn.addEventListener('click', deleteSelectedImages);
}

// ===== Tab Switching =====
function switchTab(tabName) {
    state.currentTab = tabName;

    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    if (tabName === 'gallery') {
        loadGallery();
    }
}

// ===== Server Status =====
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();

        const isConnected = data.registeredModels && data.registeredModels.length > 0;

        elements.statusDot.classList.toggle('connected', isConnected);
        elements.statusText.textContent = isConnected
            ? `已连接 (${data.registeredModels.join(', ')})`
            : '未连接';

        return isConnected;
    } catch (error) {
        console.error('Status check failed:', error);
        elements.statusText.textContent = '连接失败';
        return false;
    }
}

// ===== Chat Functions =====
async function sendChatMessage() {
    const prompt = elements.chatInput.value.trim();
    if (!prompt) return;

    const model = elements.chatModel.value;
    const chatReferenceImageData = Array.from(state.chatReferenceImages);

    // Add user message
    addChatMessage('user', prompt, chatReferenceImageData);
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';

    // Show loading
    showLoading('AI正在思考...');

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                reference_images: chatReferenceImageData
            })
        });

        const data = await response.json();

        if (data.success) {
            addChatMessage('assistant', data.text);
        } else {
            addChatMessage('assistant', '抱歉，出现了错误：' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('Chat error:', error);
        addChatMessage('assistant', '抱歉，请求失败了。请检查网络连接。');
    } finally {
        hideLoading();
        // 发送后清空聊天参考图
        state.chatReferenceImages.clear();
        updateChatReferencePreview();
    }
}

function addChatMessage(role, content, images = []) {
    // Remove welcome message if exists
    const welcome = elements.chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // 如果有参考图，先显示图片
    if (images && images.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'message-images';
        images.forEach(imgData => {
            const img = document.createElement('img');
            img.src = imgData;
            img.className = 'message-image';
            img.onclick = () => openImagePreview(imgData);
            imagesContainer.appendChild(img);
        });
        contentDiv.appendChild(imagesContainer);
    }

    const textDiv = document.createElement('div');
    textDiv.textContent = content;
    contentDiv.appendChild(textDiv);

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
    contentDiv.appendChild(time);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

    state.chatHistory.push({ role, content, images, timestamp: Date.now() });
}

// ===== Image Generation =====
async function generateImage() {
    const prompt = elements.imagePrompt.value.trim();
    if (!prompt) {
        alert('请输入图片描述');
        return;
    }

    const model = elements.imageModel.value;
    const aspectRatio = elements.aspectRatio.value;
    const referenceImageData = Array.from(state.referenceImages);

    showLoading('正在生成图片，请稍候...');

    try {
        console.log('Sending request with', referenceImageData.length, 'reference images');

        const response = await fetch(`${API_BASE}/api/images/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                reference_images: referenceImageData,
                aspect_ratio: aspectRatio
            })
        });

        const data = await response.json();

        if (data.success && data.images && data.images.length > 0) {
            displayGeneratedImages(data.images, prompt, model);
        } else {
            alert('图片生成失败：' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('Image generation error:', error);
        alert('图片生成失败，请检查网络连接');
    } finally {
        hideLoading();
    }
}

/**
 * Convert image URL to base64
 */
async function imageUrlToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            try {
                const dataURL = canvas.toDataURL('image/png');
                resolve(dataURL);
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = function () {
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

function displayGeneratedImages(images, prompt, model) {
    // Remove empty state if exists
    const emptyState = elements.generationResults.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    images.forEach(imageInfo => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const img = document.createElement('img');
        img.className = 'result-image';
        img.src = imageInfo.url;
        img.alt = prompt;
        img.onclick = () => openImagePreview(imageInfo.url);

        const info = document.createElement('div');
        info.className = 'result-info';

        const promptText = document.createElement('div');
        promptText.className = 'result-prompt';
        promptText.textContent = prompt;

        const actions = document.createElement('div');
        actions.className = 'result-actions';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn-download';
        downloadBtn.innerHTML = '<span>📥</span><span>下载</span>';
        downloadBtn.onclick = () => downloadImage(imageInfo.url, prompt);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary btn-small';
        saveBtn.innerHTML = '<span class="btn-icon">💾</span><span class="btn-text">保存到图片库</span>';
        saveBtn.onclick = () => saveGeneratedImage(imageInfo, prompt, model, saveBtn);

        actions.appendChild(downloadBtn);
        actions.appendChild(saveBtn);
        info.appendChild(promptText);
        info.appendChild(actions);
        card.appendChild(img);
        card.appendChild(info);

        elements.generationResults.insertBefore(card, elements.generationResults.firstChild);

        state.generatedImages.push(imageInfo);
    });
}

function clearResults() {
    elements.generationResults.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🎨</div>
            <p>生成的图片将显示在这里</p>
        </div>
    `;
    state.generatedImages = [];
}

/**
 * 保存生成的图片到图片库
 */
async function saveGeneratedImage(imageInfo, prompt, model, buttonElement) {
    try {
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">保存中...</span>';

        const response = await fetch(`${API_BASE}/api/images/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: imageInfo.url,
                prompt: prompt,
                model: model
            })
        });

        const data = await response.json();

        if (data.success) {
            buttonElement.innerHTML = '<span class="btn-icon">✅</span><span class="btn-text">已保存</span>';
            buttonElement.classList.remove('btn-primary');
            buttonElement.classList.add('btn-success');
            await loadGallery(); // Refresh gallery
        } else {
            throw new Error(data.error || '保存失败');
        }
    } catch (error) {
        console.error('Save image error:', error);
        alert('保存失败：' + error.message);
        buttonElement.disabled = false;
        buttonElement.innerHTML = '<span class="btn-icon">💾</span><span class="btn-text">保存到图片库</span>';
    }
}

/**
 * 处理本地图片上传
 */
async function handleLocalImageUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    showLoading('正在处理图片...');

    try {
        for (const file of files) {
            // 转换为base64
            const base64 = await fileToBase64(file);
            // 添加到参考图集合
            state.referenceImages.add(base64);
        }

        updateReferencePreview();
        alert(`成功添加 ${files.length} 张参考图`);
    } catch (error) {
        console.error('Upload error:', error);
        alert('图片上传失败：' + error.message);
    } finally {
        hideLoading();
        // 清空input，允许重复选择同一文件
        event.target.value = '';
    }
}

/**
 * 将File对象转换为base64
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== Chat Reference Images =====
/**
 * 打开聊天参考图选择模态框
 */
async function openChatReferenceModal() {
    await loadGallery();

    // Populate modal gallery
    const images = await fetchImages();
    elements.modalGallery.innerHTML = '';

    if (images.length === 0) {
        elements.modalGallery.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📁</div>
                <p>暂无保存的图片</p>
            </div>
        `;
    } else {
        images.forEach(imageInfo => {
            const item = createGalleryItem(imageInfo, true);
            elements.modalGallery.appendChild(item);
        });
    }

    // 修改模态框确认按钮的行为
    const confirmBtn = elements.modalConfirm;
    const cancelBtn = elements.modalCancel;

    // 移除旧的事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    elements.modalConfirm = newConfirmBtn;

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    elements.modalCancel = newCancelBtn;

    // 添加新的事件监听器（用于聊天参考图）
    newConfirmBtn.addEventListener('click', confirmChatReferenceSelection);
    newCancelBtn.addEventListener('click', closeReferenceModal);

    elements.referenceModal.classList.add('active');
}

/**
 * 确认聊天参考图选择
 */
function confirmChatReferenceSelection() {
    const checkboxes = elements.modalGallery.querySelectorAll('input[type="checkbox"]:checked');
    state.chatReferenceImages.clear();

    checkboxes.forEach(checkbox => {
        const item = checkbox.closest('.gallery-item');
        if (item && item.dataset.imageUrl) {
            state.chatReferenceImages.add(item.dataset.imageUrl);
        }
    });

    updateChatReferencePreview();
    closeReferenceModal();

    // 恢复原来的确认按钮行为
    setupEventListeners();
}

/**
 * 处理聊天本地图片上传
 */
async function handleChatLocalImageUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    showLoading('正在处理图片...');

    try {
        for (const file of files) {
            const base64 = await fileToBase64(file);
            state.chatReferenceImages.add(base64);
        }

        updateChatReferencePreview();
        alert(`成功添加 ${files.length} 张参考图`);
    } catch (error) {
        console.error('Upload error:', error);
        alert('图片上传失败：' + error.message);
    } finally {
        hideLoading();
        event.target.value = '';
    }
}

/**
 * 更新聊天参考图预览
 */
function updateChatReferencePreview() {
    elements.chatReferenceCount.textContent = state.chatReferenceImages.size;
    elements.chatReferencePreview.innerHTML = '';

    // 如果没有参考图，隐藏预览区域
    if (state.chatReferenceImages.size === 0) {
        elements.chatReferencePreview.style.display = 'none';
        return;
    }

    // 有参考图时显示预览区域
    elements.chatReferencePreview.style.display = 'flex';

    state.chatReferenceImages.forEach(imageData => {
        const item = document.createElement('div');
        item.className = 'reference-item';

        const img = document.createElement('img');
        img.src = imageData;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'reference-remove';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            state.chatReferenceImages.delete(imageData);
            updateChatReferencePreview();
        };

        item.appendChild(img);
        item.appendChild(removeBtn);
        elements.chatReferencePreview.appendChild(item);
    });
}


// ===== Reference Images =====
async function openReferenceModal() {
    await loadGallery();

    // Populate modal gallery
    const images = await fetchImages();
    elements.modalGallery.innerHTML = '';

    if (images.length === 0) {
        elements.modalGallery.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📁</div>
                <p>暂无保存的图片</p>
            </div>
        `;
    } else {
        images.forEach(imageInfo => {
            const item = createGalleryItem(imageInfo, true);
            elements.modalGallery.appendChild(item);
        });
    }

    elements.referenceModal.classList.add('active');
}

function closeReferenceModal() {
    elements.referenceModal.classList.remove('active');
}

function confirmReferenceSelection() {
    // Get selected images from modal
    const checkboxes = elements.modalGallery.querySelectorAll('input[type="checkbox"]:checked');
    state.referenceImages.clear();

    checkboxes.forEach(checkbox => {
        // Find parent item to get URL
        const item = checkbox.closest('.gallery-item');
        if (item && item.dataset.imageUrl) {
            state.referenceImages.add(item.dataset.imageUrl);
        }
    });

    updateReferencePreview();
    closeReferenceModal();
}

function updateReferencePreview() {
    elements.referenceCount.textContent = state.referenceImages.size;
    elements.referencePreview.innerHTML = '';

    state.referenceImages.forEach(imageData => {
        const item = document.createElement('div');
        item.className = 'reference-item';

        const img = document.createElement('img');
        // imageData可能是URL或base64
        img.src = imageData;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'reference-remove';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            state.referenceImages.delete(imageData);
            updateReferencePreview();
        };

        item.appendChild(img);
        item.appendChild(removeBtn);
        elements.referencePreview.appendChild(item);
    });
}

// ===== Gallery =====
async function loadGallery() {
    const images = await fetchImages();

    elements.galleryCount.textContent = images.length;
    elements.galleryGrid.innerHTML = '';

    if (images.length === 0) {
        elements.galleryGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📁</div>
                <p>暂无保存的图片</p>
            </div>
        `;
        return;
    }

    images.forEach(imageInfo => {
        const item = createGalleryItem(imageInfo, false);
        elements.galleryGrid.appendChild(item);
    });

    updateDeleteButton();
}

function createGalleryItem(imageInfo, isModal = false) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    if (!isModal) item.dataset.id = imageInfo.id;
    item.dataset.imageUrl = imageInfo.url;

    // Checkbox (Always create it, but handle logic differently)
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'gallery-item-checkbox';

    // Modal selection logic
    if (isModal) {
        // Click item to toggle selection
        item.onclick = (e) => {
            // Prevent double toggling if clicking directly on checkbox
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            item.classList.toggle('selected', checkbox.checked);
        };

        // Checkbox change handler
        checkbox.onchange = () => {
            item.classList.toggle('selected', checkbox.checked);
        };
    }

    const img = document.createElement('img');
    img.className = 'gallery-item-image';
    img.src = imageInfo.url;
    img.alt = imageInfo.prompt || 'Generated image';

    // Image click handler
    img.onclick = (e) => {
        if (isModal) {
            // In modal: Allow bubble up to item.onclick (Selection)
            // Do NOT stop propagation
        } else {
            // In gallery: Preview
            e.stopPropagation();
            openImagePreview(imageInfo.url);
        }
    };

    const info = document.createElement('div');
    info.className = 'gallery-item-info';

    const prompt = document.createElement('div');
    prompt.className = 'gallery-item-prompt';
    prompt.textContent = imageInfo.prompt || '无描述';

    const meta = document.createElement('div');
    meta.className = 'gallery-item-meta';

    const model = document.createElement('span');
    model.textContent = imageInfo.model || 'Unknown';

    const date = document.createElement('span');
    date.textContent = new Date(imageInfo.createdAt).toLocaleDateString('zh-CN');

    meta.appendChild(model);
    meta.appendChild(date);

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download';
    downloadBtn.innerHTML = '<span>📥</span><span>下载</span>';
    downloadBtn.onclick = (e) => {
        e.stopPropagation();
        downloadImage(imageInfo.url, imageInfo.prompt || 'image');
    };

    info.appendChild(prompt);
    info.appendChild(meta);
    info.appendChild(downloadBtn);

    item.appendChild(checkbox); // Add checkbox first
    item.appendChild(img);
    item.appendChild(info);

    if (!isModal) {
        // Gallery mode specific checkbox logic
        checkbox.onclick = (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                state.selectedImages.add(imageInfo.id);
            } else {
                state.selectedImages.delete(imageInfo.id);
            }
            updateDeleteButton();
        };

        // Also allow selecting by clicking item (optional, but good UX)
        // But currently gallery mode might expect only checkbox selection to avoid conflict with preview?
        // Let's keep gallery mode simple: Checkbox for selection, Image for preview.
    }

    return item;
}

async function fetchImages() {
    try {
        const response = await fetch(`${API_BASE}/api/images`);
        const data = await response.json();
        return data.images || [];
    } catch (error) {
        console.error('Fetch images error:', error);
        return [];
    }
}

async function deleteSelectedImages() {
    if (state.selectedImages.size === 0) return;

    if (!confirm(`确定要删除选中的 ${state.selectedImages.size} 张图片吗？`)) {
        return;
    }

    showLoading('正在删除...');

    try {
        const response = await fetch(`${API_BASE}/api/images/delete-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: Array.from(state.selectedImages) })
        });

        const data = await response.json();

        if (data.success) {
            state.selectedImages.clear();
            await loadGallery();
        } else {
            alert('删除失败：' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('删除失败，请检查网络连接');
    } finally {
        hideLoading();
    }
}

function updateDeleteButton() {
    elements.deleteSelectedBtn.disabled = state.selectedImages.size === 0;
    elements.deleteSelectedBtn.querySelector('.btn-text').textContent =
        state.selectedImages.size > 0
            ? `删除选中 (${state.selectedImages.size})`
            : '删除选中';
}

// ===== Loading =====
function showLoading(text = '加载中...') {
    elements.loadingOverlay.style.display = 'flex';
    elements.loadingOverlay.querySelector('.loading-text').textContent = text;
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

// ===== Image Preview and Download =====
function openImagePreview(imageUrl) {
    elements.previewImg.src = imageUrl;
    elements.imagePreviewModal.classList.add('active');

    // Update download button
    elements.previewDownload.onclick = () => {
        const filename = `image_${Date.now()}.png`;
        downloadImage(imageUrl, filename);
    };
}

function closeImagePreview() {
    elements.imagePreviewModal.classList.remove('active');
    elements.previewImg.src = '';
}

async function downloadImage(imageUrl, filename) {
    try {
        // 使用时间戳生成文件名
        const timestamp = Date.now();
        const downloadFilename = `image_${timestamp}.png`;

        // 如果是base64，直接下载
        if (imageUrl.startsWith('data:')) {
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = downloadFilename;
            link.click();
            return;
        }

        // 如果是URL，先fetch再下载
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = downloadFilename;
        link.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        alert('下载失败：' + error.message);
    }
}

// ===== Conversation Management =====
/**
 * Delete current conversation
 */
async function deleteCurrentConversation() {
    if (!confirm('确定要删除当前会话吗？删除后将自动开启新对话。')) {
        return;
    }

    showLoading('正在删除当前会话...');

    try {
        // Send message to Chrome extension via豆包页面
        // Since we can't directly communicate with extension from web app,
        // we'll use a workaround: send a special API request that the extension will handle
        const response = await fetch(`${API_BASE}/api/chat/delete-current-conversation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            // Clear chat history
            state.chatHistory = [];
            elements.chatMessages.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">👋</div>
                    <h3>新对话已开启</h3>
                    <p>今天想聊点什么？</p>
                </div>
            `;
            alert('当前会话已删除');
        } else {
            alert('删除失败：' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('Delete conversation error:', error);
        alert('删除失败，请检查网络连接');
    } finally {
        hideLoading();
    }
}

/**
 * Delete all conversations
 */
async function deleteAllConversations() {
    if (!confirm('确定要删除所有会话吗？此操作不可恢复！')) {
        return;
    }

    showLoading('正在删除所有会话...');

    try {
        const response = await fetch(`${API_BASE}/api/chat/delete-all-conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            // Clear chat history
            state.chatHistory = [];
            elements.chatMessages.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">👋</div>
                    <h3>所有会话已清空</h3>
                    <p>开始全新的对话吧！</p>
                </div>
            `;
            alert('所有会话已删除');
        } else {
            alert('删除失败：' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('Delete all conversations error:', error);
        alert('删除失败，请检查网络连接');
    } finally {
        hideLoading();
    }
}

// ===== Start Application =====
init();

// Check status periodically
setInterval(checkServerStatus, 30000);
