import { useCallback, useEffect } from 'react';
import { useImageStore, makeJob } from '../store/imageStore';
import { useSettingsStore } from '../store/settingsStore';
import { saveHistory, generateImages } from '../services/doubaoApi';
import { chromeWorker } from '../services/chromeWorker';
import type { AspectRatio } from '../types';

export function useImageGeneration() {
  const { settings } = useSettingsStore();
  const { setCurrentJob, updateCurrentJob, addImage } = useImageStore();

  // Connect to WebSocket for progress updates only
  useEffect(() => {
    const wsUrl = settings.websocketUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    chromeWorker.connect(wsUrl);
    
    // Set progress callback
    chromeWorker.setProgressCallback((text: string) => {
      updateCurrentJob({ progressText: text });
    });

    return () => {
      chromeWorker.disconnect();
    };
  }, [settings.websocketUrl, updateCurrentJob]);

  const generate = useCallback(
    async (prompt: string, _model?: string, aspectRatio?: AspectRatio, switchToImageMode?: boolean, referenceImages?: string[]) => {
      const targetRatio = aspectRatio ?? settings.defaultAspectRatio;
      const job = makeJob(prompt, 'doubao', targetRatio);
      
      // Add reference images to job state
      const jobWithRefs = { ...job, referenceImages };
      setCurrentJob(jobWithRefs);
      updateCurrentJob({ status: 'generating', progressText: '正在生成图片...' });

      try {
        // Use HTTP API to generate images via Chrome extension
        console.log('[useImageGeneration] Calling generateImages...');
        const results = await generateImages(
          prompt,
          targetRatio,
          settings.websocketUrl,
          switchToImageMode,
          referenceImages
        );
        console.log('[useImageGeneration] generateImages returned:', results.length, 'images');

        if (results.length === 0) {
          updateCurrentJob({
            status: 'error',
            error: '未生成图片，请确保豆包网页已打开',
          });
          return;
        }

        const batchId = crypto.randomUUID();

        // Create image objects
        const generatedImages = results.map((result) => {
          const id = crypto.randomUUID();
          return {
            id,
            batchId,
            url: result.url,
            thumbnailUrl: result.thumbnail_url,
            width: result.width,
            height: result.height,
            prompt,
            model: 'doubao' as const,
            aspectRatio: targetRatio,
            createdAt: Date.now(),
            status: 'success',
          };
        });

        console.log('[useImageGeneration] Adding', generatedImages.length, 'images to store');

        // Add all returned images to gallery and sync to Rust SQLite
        [...generatedImages].reverse().forEach(async (img) => {
          console.log('[useImageGeneration] addImage:', img.url.substring(0, 50));
          addImage(img);
          saveHistory(img).catch(e => console.warn('History sync failed:', e));
        });

        updateCurrentJob({ status: 'success', result: generatedImages[0] });
      } catch (error) {
        updateCurrentJob({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [settings, setCurrentJob, updateCurrentJob, addImage]
  );

  return { generate, currentJob: useImageStore.getState().currentJob };
}
