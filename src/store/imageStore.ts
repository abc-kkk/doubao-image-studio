import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GeneratedImage, GenerationJob, ModelId, AspectRatio } from '../types';

interface ImageStore {
  images: GeneratedImage[];
  currentJob: GenerationJob | null;
  selectedImageId: string | null;
  viewedImageId: string | null;

  addImage: (image: GeneratedImage) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;
  setCurrentJob: (job: GenerationJob | null) => void;
  updateCurrentJob: (patch: Partial<GenerationJob>) => void;
  selectImage: (id: string | null) => void;
  setViewedImage: (id: string | null) => void;
  purgeReferenceData: () => void;
  setImages: (images: GeneratedImage[]) => void;
}

export const useImageStore = create<ImageStore>()(
  persist(
    (set) => ({
      images: [],
      currentJob: null,
      selectedImageId: null,
      viewedImageId: null,

      addImage: (image) =>
        set((state) => ({ images: [image, ...state.images] })),

      removeImage: (id) =>
        set((state) => ({ images: state.images.filter((img) => img.id !== id) })),

      clearImages: () => set({ images: [] }),

      setCurrentJob: (job) => set({ currentJob: job }),

      updateCurrentJob: (patch) =>
        set((state) =>
          state.currentJob
            ? { currentJob: { ...state.currentJob, ...patch } }
            : {}
        ),

      selectImage: (id) => set({ selectedImageId: id }),
      setViewedImage: (id) => set({ viewedImageId: id }),
      purgeReferenceData: () =>
        set((state) => ({
          images: state.images.map(({ referenceImages, ...img }) => img as GeneratedImage),
        })),
      setImages: (images) => set({ images }),
    }),
    {
      name: 'ai-studio-images',
      partialize: (state) => ({ 
        images: state.images.map(({ referenceImages, ...img }) => img) 
      }),
    }
  )
);

// Derived helpers
export function makeJob(
  prompt: string,
  model: ModelId,
  aspectRatio: AspectRatio
): GenerationJob {
  return {
    id: crypto.randomUUID(),
    prompt,
    model,
    aspectRatio,
    status: 'pending',
    startedAt: Date.now(),
  };
}
