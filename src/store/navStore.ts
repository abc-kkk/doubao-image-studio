import { create } from 'zustand';

type View = 'studio' | 'compressor';

interface NavState {
  currentView: View;
  setView: (view: View) => void;
  // Metadata for the image being sent to the compressor
  pendingImageData?: string; 
  setPendingImage: (data?: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  currentView: 'studio',
  setView: (view) => set({ currentView: view }),
  setPendingImage: (data) => set({ pendingImageData: data }),
}));
