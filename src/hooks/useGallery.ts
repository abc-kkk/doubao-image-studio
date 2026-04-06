import { useImageStore } from '../store/imageStore';
import { useSettingsStore } from '../store/settingsStore';
import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getHistory, deleteHistory, clearHistory } from '../services/doubaoApi';
import type { GeneratedImage, ModelId, AspectRatio } from '../types';

import { ask } from '@tauri-apps/plugin-dialog';

export function useGallery() {
  const { images, removeImage, clearImages: storeClearImages, selectImage, selectedImageId, setImages } = useImageStore();

  const { settings } = useSettingsStore();

  // Load history from Rust SQLite on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await getHistory(200, 0);
        if (Array.isArray(history)) {
          // Convert to GeneratedImage format
          const converted = history.map(img => ({
            id: img.id,
            batchId: img.batchId,
            prompt: img.prompt,
            model: img.model as ModelId,
            aspectRatio: img.aspectRatio as AspectRatio,
            localPath: img.localPath,
            url: img.url,
            thumbnailUrl: img.url,
            width: undefined as number | undefined,
            height: undefined as number | undefined,
            createdAt: img.createdAt,
          }));
          setImages(converted);
        }
      } catch (e) {
        console.warn('Failed to load history:', e);
      }
    };
    
    loadHistory();
  }, [setImages]);

  const selected = images.find((img) => img.id === selectedImageId) ?? null;

  const handleSelect = useCallback(
    (img: GeneratedImage) => {
      selectImage(img.id === selectedImageId ? null : img.id);
    },
    [selectImage, selectedImageId]
  );

  const handleRemove = useCallback(
    async (id: string) => {
      // Use native dialog for confirmation
      const confirmed = await ask('确定要从历史记录和本地磁盘中删除这张图片吗？', { 
        title: '删除图片',
        kind: 'warning' 
      });
      
      if (!confirmed) return;

      const img = images.find(i => i.id === id);
      if (img?.localPath) {
        try {
          await invoke('delete_file', { path: img.localPath });
        } catch (err) {
          console.error('Failed to delete local file:', err);
        }
      }
      
      // Delete from Rust SQLite
      try {
        await deleteHistory(id);
      } catch (err) {
        console.error('Failed to delete from history:', err);
      }
      
      removeImage(id);
      if (selectedImageId === id) selectImage(null);
    },
    [images, removeImage, selectImage, selectedImageId]
  );

  const handleClear = useCallback(async () => {
    const confirmed = await ask('确定要清空所有历史记录和本地图片吗？此操作不可撤销。', { 
      title: '清空历史记录',
      kind: 'warning'
    });

    if (confirmed) {
      try {
        await invoke('clear_history_images', { saveDir: settings.historyDir });
        await clearHistory();
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
      storeClearImages();
      selectImage(null);
    }
  }, [storeClearImages, selectImage, settings.historyDir]);

  return {
    images,
    selected,
    selectedImageId,
    handleSelect,
    handleRemove,
    clearImages: handleClear,
  };
}
