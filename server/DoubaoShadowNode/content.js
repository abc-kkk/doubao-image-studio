// content.js
console.log('Doubao Shadow Node: Content Script Loaded');

// Inject the hook script
const hookScript = document.createElement('script');
hookScript.src = chrome.runtime.getURL('hook.js');
(document.head || document.documentElement).appendChild(hookScript);

let currentRequestId = null;
let accumulatedResponse = '';
let lastRequestWasImageMode = false;

// Listen for messages from the injected hook script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'DOUBAO_CHUNK') {
        const text = event.data.text;
        const images = event.data.images || [];

        accumulatedResponse += text;

        console.log('Received chunk:', { text: text.substring(0, 50), images: images.length });

        // Send final result when finished
        if (event.data.is_finish || event.data.is_finish === true) {
            console.log('Response finished via Hook:', { text: accumulatedResponse.substring(0, 100), images: images.length });

            if (currentRequestId) {
                chrome.runtime.sendMessage({
                    type: 'RESULT',
                    requestId: currentRequestId,
                    text: accumulatedResponse,
                    images: images
                });
                currentRequestId = null;
                accumulatedResponse = '';
            }
        }
    }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PROMPT') {
        currentRequestId = request.requestId;
        accumulatedResponse = ''; // Reset for new request
        processPrompt(
            request.text,
            request.requestId,
            request.isImageMode,
            request.referenceImages || [],
            request.aspectRatio || 'Auto'
        );
        sendResponse({ status: 'processing' });
    }
    return true;
});

async function processPrompt(text, requestId, isImageMode = false, referenceImages = [], aspectRatio = 'Auto') {
    console.log('Processing prompt:', text, 'Image mode:', isImageMode, 'Last was image:', lastRequestWasImageMode);
    console.log('Reference images:', referenceImages.length, 'Aspect ratio:', aspectRatio);

    // 如果是图片模式且指定了比例，自动在提示词后添加比例文本
    let finalPrompt = text;
    if (isImageMode && aspectRatio && aspectRatio !== 'Auto') {
        finalPrompt = `${text} 画面比例 ${aspectRatio}`;
        console.log('Modified prompt with aspect ratio:', finalPrompt);
    }

    // 1. Find Input Area (now a contenteditable div, not textarea)
    let inputEl = document.querySelector('[data-testid="chat_input_input"]')
        || document.querySelector('[contenteditable="true"][role="textbox"]')
        || document.querySelector('#chat-route-layout textarea')
        || document.querySelector('textarea');

    if (!inputEl) {
        console.error('Could not find input element');
        chrome.runtime.sendMessage({ type: 'RESULT', requestId, text: "Error: Could not find chat input on page." });
        return;
    }

    // Check if we need to clear previous image mode state
    if (lastRequestWasImageMode) {
        console.log('Previous request was image mode, pressing ESC to clear state');
        inputEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            bubbles: true
        }));
        await new Promise(r => setTimeout(r, 1000)); // Wait longer for UI to reset

        // Re-query input element as it might have been replaced
        const freshInput = document.querySelector('[data-testid="chat_input_input"]')
            || document.querySelector('[contenteditable="true"][role="textbox"]')
            || document.querySelector('#chat-route-layout textarea')
            || document.querySelector('textarea');

        if (freshInput) {
            freshInput.click();
            freshInput.focus();
            inputEl = freshInput; // Update inputEl reference
        }
        await new Promise(r => setTimeout(r, 300));
    }

    // Update state for next time
    lastRequestWasImageMode = isImageMode;

    // If image mode, first trigger image generation mode
    if (isImageMode) {
        console.log('Image mode: Checking if already in image generation mode...');

        // Check if already in image generation mode
        // Look for image generation specific elements (reference image button, ratio button, etc.)
        const isAlreadyInImageMode =
            document.querySelector('[data-testid="image-creation-chat-input-picture-reference-button"]') ||
            document.querySelector('[data-testid="image-creation-chat-input-picture-ration-button"]') ||
            document.querySelector('[data-testid="image-creation-chat-input-picture-model-button"]');

        if (isAlreadyInImageMode) {
            console.log('Already in image generation mode, skipping mode switch');

            // Find the input element
            const newInputEl = document.querySelector('[data-testid="chat_input_input"]')
                || document.querySelector('[contenteditable="true"][role="textbox"]')
                || document.querySelector('div.editor-wrapper-aTMAEc [contenteditable="true"]');

            if (newInputEl) {
                console.log('Found input element in image mode');
                newInputEl.click();
                newInputEl.focus();
                await new Promise(r => setTimeout(r, 300));

                // Upload reference images if provided
                if (referenceImages && referenceImages.length > 0) {
                    console.log('Uploading', referenceImages.length, 'reference images...');
                    const uploadSuccess = await uploadReferenceImages(referenceImages);
                    if (!uploadSuccess) {
                        console.error('Failed to upload reference images');
                    }
                    await new Promise(r => setTimeout(r, 500));
                }

                // Send actual prompt
                await sendTextToInput(newInputEl, finalPrompt);
                await clickSendButton();
                return;
            } else {
                console.error('Could not find input element in image mode');
                return;
            }
        }

        // Not in image mode yet, need to switch
        console.log('Not in image generation mode, triggering mode switch...');

        // Re-find input element (DOM might have changed after ESC)
        let currentInput = document.querySelector('div.editor-wrapper-aTMAEc textarea')
            || document.querySelector('#chat-route-layout textarea')
            || document.querySelector('[data-testid="chat_input_input"]')
            || document.querySelector('textarea');

        if (!currentInput) {
            console.error('Could not find input element');
            return;
        }

        console.log('Found input for command:', currentInput.tagName);

        // Refocus input
        currentInput.click();
        currentInput.focus();
        await new Promise(r => setTimeout(r, 200));

        // Type /图像 (short version to trigger popup)
        await sendTextToInput(currentInput, '/图像');
        await new Promise(r => setTimeout(r, 1500)); // Wait for popup to appear

        // Find and click "图像生成" button in the popup with retry
        console.log('Looking for 图像生成 button in popup...');
        let imageGenButton = null;

        // Try multiple times to find the button (popup might take time to render)
        for (let attempt = 0; attempt < 5; attempt++) {
            const allButtons = Array.from(document.querySelectorAll('button'));
            imageGenButton = allButtons.find(btn => {
                const text = btn.textContent.trim();
                return text === '图像生成' || text.includes('图像生成') || text.includes('图像');
            });

            if (imageGenButton) {
                console.log('Found 图像生成 button on attempt', attempt + 1);
                break;
            }

            console.log('Button not found, retrying... (attempt', attempt + 1, ')');
            await new Promise(r => setTimeout(r, 500));
        }

        if (imageGenButton) {
            imageGenButton.click();
            console.log('Clicked 图像生成 button');
            await new Promise(r => setTimeout(r, 1000)); // Wait for mode to activate

            // Re-find the input element (it DEFINITELY changes to contenteditable div here)
            const newInputEl = document.querySelector('[data-testid="chat_input_input"]')
                || document.querySelector('[contenteditable="true"][role="textbox"]')
                || document.querySelector('div.editor-wrapper-aTMAEc [contenteditable="true"]');

            if (newInputEl) {
                console.log('Found new input element:', newInputEl.tagName, newInputEl.className);

                // Click and focus the new input
                newInputEl.click();
                newInputEl.focus();
                await new Promise(r => setTimeout(r, 300));

                // Upload reference images if provided
                if (referenceImages && referenceImages.length > 0) {
                    console.log('Uploading', referenceImages.length, 'reference images...');
                    const uploadSuccess = await uploadReferenceImages(referenceImages);
                    if (!uploadSuccess) {
                        console.error('Failed to upload reference images');
                    }
                    await new Promise(r => setTimeout(r, 500));
                }

                // Send actual prompt to the NEW input element
                await sendTextToInput(newInputEl, finalPrompt);
                await clickSendButton();
            } else {
                console.error('Could not find input element after clicking image generation button');
                // Fallback: try with previous input if it still exists
                currentInput.click();
                currentInput.focus();
                await sendTextToInput(currentInput, finalPrompt);
                await clickSendButton();
            }
        } else {
            console.error('图像生成 button not found in popup');
            // Fallback: clear input and continue
            await sendTextToInput(currentInput, '');
        }
        await new Promise(r => setTimeout(r, 2000)); // Wait longer for message to be sent
    } else {
        // Normal text mode - 支持参考图
        console.log('Text chat mode');

        // 如果有参考图，需要先上传参考图
        if (referenceImages && referenceImages.length > 0) {
            console.log('Text mode with', referenceImages.length, 'reference images');

            // 确保输入框获得焦点
            inputEl.click();
            inputEl.focus();
            await new Promise(r => setTimeout(r, 300));

            // 上传参考图
            const uploadSuccess = await uploadReferenceImages(referenceImages);
            if (!uploadSuccess) {
                console.error('Failed to upload reference images in text mode');
            }

            // 短暂等待，让上传开始
            await new Promise(r => setTimeout(r, 500));
        }

        // 发送文本
        await sendTextToInput(inputEl, text);

        // 直接点击发送按钮，clickSendButton会自动检查按钮状态并等待启用
        await clickSendButton();
    }

    // 3. Set timeout
    setTimeout(() => {
        if (currentRequestId === requestId) {
            if (accumulatedResponse.length > 0) {
                chrome.runtime.sendMessage({ type: 'RESULT', requestId, text: accumulatedResponse });
            } else {
                chrome.runtime.sendMessage({ type: 'RESULT', requestId, text: "Error: Timeout" });
            }
            currentRequestId = null;
        }
    }, 60000);
}

async function sendTextToInput(inputEl, text) {
    // Check if it's a contenteditable element or textarea
    if (inputEl.contentEditable === 'true') {
        // For contenteditable div
        inputEl.textContent = text;

        // Trigger multiple events to ensure Doubao detects the input
        inputEl.dispatchEvent(new Event('focus', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[0] || 'a' }));
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[0] || 'a' }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));

        // Also trigger composition events (for Chinese input)
        inputEl.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        inputEl.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: text }));
        inputEl.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
    } else {
        // For textarea
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeTextAreaValueSetter.call(inputEl, text);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 300));
}

async function clickSendButton() {
    const sendBtn = findSendButton();

    if (sendBtn) {
        console.log('Found send button');

        // Check if button is disabled using multiple methods
        const checkDisabled = () => {
            return sendBtn.disabled ||
                sendBtn.hasAttribute('disabled') ||
                sendBtn.getAttribute('aria-disabled') === 'true' ||
                sendBtn.classList.contains('disabled');
        };

        let isDisabled = checkDisabled();

        if (isDisabled) {
            console.log('Send button is disabled, waiting for it to be enabled...');
            console.log('(This is normal when uploading reference images)');

            // Wait up to 2 minutes for the button to be enabled
            // This handles image upload completion (supports multiple large images)
            let waitTime = 0;
            const maxWaitTime = 120000; // 2 minutes (120 seconds)
            const checkInterval = 500; // Check every 500ms

            while (waitTime < maxWaitTime) {
                await new Promise(r => setTimeout(r, checkInterval));
                waitTime += checkInterval;

                isDisabled = checkDisabled();

                if (!isDisabled) {
                    console.log('Send button is now enabled after', waitTime / 1000, 'seconds');
                    break;
                }

                // Log progress every 5 seconds
                if (waitTime % 5000 === 0) {
                    console.log('Still waiting for button... (' + (waitTime / 1000) + 's)');
                }

                // Optimization: Re-trigger input events every 2 seconds to ensure UI detects changes
                if (waitTime % 2000 === 0) {
                    const inputEl = document.querySelector('[data-testid="chat_input_input"]')
                        || document.querySelector('[contenteditable="true"][role="textbox"]')
                        || document.querySelector('div.editor-wrapper-aTMAEc [contenteditable="true"]');

                    if (inputEl) {
                        console.log('Re-triggering input event to wake up UI...');
                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }

            if (isDisabled) {
                console.error('Send button is still disabled after waiting 2 minutes');
                console.log('Attempting to click anyway...');
            }
        } else {
            console.log('Send button is enabled, clicking now');
        }

        sendBtn.click();
    } else {
        console.log('Send button not found, trying Enter key');
        const inputEl = document.querySelector('[data-testid="chat_input_input"]') || document.querySelector('textarea');
        if (inputEl) {
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
    }

    await new Promise(r => setTimeout(r, 300));
}

function findSendButton() {
    // Try multiple selectors
    const selectors = [
        '[data-testid="chat_input_send_button"]', // Specific ID from user
        '#flow-end-msg-send',
        'button[aria-label*="发送"]',
        'button[type="submit"]',
        'button svg[class*="send"]',
        '.send-button'
    ];

    for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn) return btn;
    }

    // Fallback: find button near textarea
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        const svg = btn.querySelector('svg');
        if (svg && btn.closest('form, .input-container, [class*="input"]')) {
            return btn;
        }
    }

    return null;
}

/**
 * Upload reference images to Doubao
 * @param {Array<string>} referenceImages - Array of base64 encoded images (with or without data URI prefix)
 * @returns {Promise<boolean>} - Success status
 */
async function uploadReferenceImages(referenceImages) {
    try {
        console.log('Starting reference image upload...');

        // Find file input element for reference images
        // Based on the Python code selector: 'input[type="file"].input-QqWhqy'
        const fileInputs = document.querySelectorAll('input[type="file"]');

        if (fileInputs.length === 0) {
            console.error('No file input found for reference images');
            return false;
        }

        console.log('Found', fileInputs.length, 'file input elements');

        // Convert base64 images to File objects
        const files = [];
        for (let i = 0; i < referenceImages.length; i++) {
            const base64Data = referenceImages[i];

            // Remove data URI prefix if present
            const base64Content = base64Data.includes(',')
                ? base64Data.split(',')[1]
                : base64Data;

            // Detect image type from data URI or default to png
            let mimeType = 'image/png';
            if (base64Data.startsWith('data:')) {
                const match = base64Data.match(/data:([^;]+);/);
                if (match) {
                    mimeType = match[1];
                }
            }

            try {
                // Convert base64 to blob
                const byteCharacters = atob(base64Content);
                const byteNumbers = new Array(byteCharacters.length);
                for (let j = 0; j < byteCharacters.length; j++) {
                    byteNumbers[j] = byteCharacters.charCodeAt(j);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: mimeType });

                // Create File object
                const extension = mimeType.split('/')[1];
                const file = new File([blob], `reference_${i + 1}.${extension}`, { type: mimeType });
                files.push(file);
            } catch (innerError) {
                console.error(`Error processing image ${i}:`, innerError);
                console.error('Base64 prefix:', base64Data.substring(0, 50));
                console.error('Base64 length:', base64Data.length);
                throw innerError; // Re-throw to be caught by outer catch
            }
        }

        console.log('Converted', files.length, 'base64 images to File objects');

        // Create DataTransfer to set files
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));

        // Try to set files on the first file input (most likely the reference image input)
        const fileInput = fileInputs[0];
        fileInput.files = dataTransfer.files;

        // Trigger change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        console.log('Triggered file upload for', files.length, 'reference images');

        // Wait a short time for the upload to start
        await new Promise(r => setTimeout(r, 1000));

        console.log('Reference images upload initiated');
        return true;

    } catch (error) {
        console.error('Error uploading reference images:', error);
        return false;
    }
}


