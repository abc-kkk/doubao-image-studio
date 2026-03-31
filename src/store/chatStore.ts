import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  streaming?: boolean;
  createdAt: number;
}

interface ChatState {
  messages: ChatMessage[];
  conversationId: string;
  streamingId: string | null;

  addMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => string;
  updateStreaming: (id: string, text: string, thinking?: string) => void;
  finishStreaming: (id: string, text: string, thinking?: string) => void;
  clearMessages: () => void;
  setConversationId: (id: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      conversationId: '',
      streamingId: null,

      addMessage: (msg) => {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({
          messages: [...state.messages, { ...msg, id, createdAt: Date.now() }],
          streamingId: msg.streaming ? id : state.streamingId,
        }));
        return id;
      },

      updateStreaming: (id, text, thinking) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id
              ? { ...m, content: m.content + text, thinking: thinking ?? m.thinking }
              : m
          ),
        }));
      },

      finishStreaming: (id, text, thinking) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id
              ? { ...m, content: text || m.content, thinking: thinking ?? m.thinking, streaming: false }
              : m
          ),
          streamingId: null,
        }));
      },

      clearMessages: () => {
        set({ messages: [], conversationId: '', streamingId: null });
      },

      setConversationId: (id) => {
        set({ conversationId: id });
      },
    }),
    {
      name: 'doubao-chat',
      partialize: (state) => ({
        messages: state.messages.map((m) => ({ ...m, streaming: false })),
        conversationId: state.conversationId,
      }),
    }
  )
);
