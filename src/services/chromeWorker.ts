import type { WorkerMessage, ModelId, AspectRatio, ResponseContent } from '../types';

export interface ImageResult {
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
}

export class ChromeWorker {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (data: unknown) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
  private reconnectTimer: number | null = null;
  private onProgressCallback: ((text: string) => void) | null = null;

  connect(url: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.log('[ChromeWorker] Connecting to:', url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[ChromeWorker] Connected');
      // Register models
      this.ws?.send(JSON.stringify({ type: 'REGISTER', models: ['doubao-pro', 'doubao-pro-image'] }));
      this.scheduleHeartbeat();
    };

    this.ws.onmessage = (e) => this.handleMessage(e.data);

    this.ws.onclose = () => {
      console.log('[ChromeWorker] Disconnected');
      this.scheduleReconnect(url);
    };

    this.ws.onerror = (err) => {
      console.error('[ChromeWorker] Error', err);
    };
  }

  setProgressCallback(callback: (text: string) => void) {
    this.onProgressCallback = callback;
  }

  private handleMessage(data: string) {
    try {
      const msg: WorkerMessage = JSON.parse(data);

      // Handle progress updates
      if (msg.type === 'PROGRESS' && this.onProgressCallback) {
        this.onProgressCallback(msg.text || '');
      }

      // Handle response for pending request (RESPONSE, ERROR, GENERATE, PROGRESS have requestId)
      if ('requestId' in msg && msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timeout);
        pending.resolve(msg);
        this.pendingRequests.delete(msg.requestId);
      }
    } catch (e) {
      console.warn('[ChromeWorker] Invalid message', e);
    }
  }

  async generateImage(
    prompt: string,
    model: ModelId,
    aspectRatio: AspectRatio
  ): Promise<ImageResult[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const requestId = crypto.randomUUID();
    // Format must match what background.ts expects
    const msg = {
      type: 'GENERATE',
      requestId,
      model,
      contents: [{
        parts: [{ text: prompt }]
      }],
      aspect_ratio: aspectRatio,
    };

    console.log('[ChromeWorker] Sending GENERATE:', msg);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timeout waiting for response'));
      }, 240000);

      this.pendingRequests.set(requestId, { resolve: resolve as (data: unknown) => void, reject, timeout });

      this.ws!.send(JSON.stringify(msg));
    }).then((data) => {
      const resp = data as WorkerMessage;
      console.log('[ChromeWorker] Received response:', resp);
      
      if (resp.type === 'ERROR') {
        throw new Error(resp.error ?? 'Unknown error');
      }

      // After eliminating ERROR, resp must be RESPONSE
      const content = (resp as { type: 'RESPONSE'; content: ResponseContent }).content;
      if (!content?.parts?.[0]) {
        throw new Error('Invalid response format');
      }
      
      const imagePart = content.parts[0];
      return [{
        url: imagePart.imageUrl || '',
        thumbnail_url: imagePart.thumbnailUrl,
        width: imagePart.width,
        height: imagePart.height,
      }];
    }) as Promise<ImageResult[]>;
  }

  private scheduleReconnect(url: string) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.connect(url);
      this.reconnectTimer = null;
    }, 5000);
  }

  private scheduleHeartbeat() {
    const interval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      } else {
        clearInterval(interval);
      }
    }, 30000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export const chromeWorker = new ChromeWorker();
