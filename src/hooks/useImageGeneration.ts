import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useImageStore, makeJob } from '../store/imageStore';
import { useSettingsStore } from '../store/settingsStore';
import { generateImages } from '../services/doubaoApi';
import type { AspectRatio } from '../types';

export function useImageGeneration() {
  const { settings } = useSettingsStore();
  const { setCurrentJob, updateCurrentJob, addImage, currentJob } = useImageStore();

  const generate = useCallback(
    async (prompt: string, _model?: string, aspectRatio?: AspectRatio, switchToImageMode?: boolean, referenceImages?: string[]) => {
      const targetRatio = aspectRatio ?? settings.defaultAspectRatio;
      const job = makeJob(prompt, 'doubao', targetRatio);
      
      // Add reference images to job state
      const jobWithRefs = { ...job, referenceImages };
      setCurrentJob(jobWithRefs);
      updateCurrentJob({ status: 'generating' });

      try {
        const urls = await generateImages(
          prompt, 
          targetRatio, 
          settings.websocketUrl, 
          switchToImageMode ?? false, 
          referenceImages
        );

        const batchId = crypto.randomUUID();

        // Save each image to local history folder
        const savedImages = await Promise.all(urls.map(async (url) => {
          const id = crypto.randomUUID();
          let localPath: string | undefined;
          try {
            // Save to local disk
            localPath = await invoke<string>('save_history_image', { 
              url, 
              id, 
              saveDir: settings.historyDir 
            });
          } catch (err) {
            console.error('[AI Studio] Failed to save history image:', err);
          }
          
          return {
            id,
            batchId,
            url,
            localPath,
            prompt,
            model: 'doubao' as const,
            aspectRatio: targetRatio,
            createdAt: Date.now(),
          };
        }));

        // Add all returned images to gallery and sync to SQLite
        const base = settings.websocketUrl.replace('ws://', 'http://').replace('/ws', '');
        
        [...savedImages].reverse().forEach(async (img) => {
          addImage(img);
          // Sync to SQLite (don't await to keep UI fast)
          fetch(`${base}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(img)
          }).catch(e => console.warn('History sync failed:', e));
        });

        updateCurrentJob({ status: 'success', result: savedImages[0] });
      } catch (error) {
        updateCurrentJob({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [settings, setCurrentJob, updateCurrentJob, addImage]
  );

  return { generate, currentJob };
}
