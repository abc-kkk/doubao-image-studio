import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { sendChatMessage, type ChatMessage } from '../../services/doubaoApi';

interface Message extends ChatMessage {
  id: string;
  streaming?: boolean;
}

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { settings } = useSettingsStore();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const assistantId = `${Date.now()}_a`;
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    const history: ChatMessage[] = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    try {
      await sendChatMessage(history, settings.websocketUrl, (delta) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + delta } : m
        ));
      });
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `错误：${err instanceof Error ? err.message : '请求失败'}`, streaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f13]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <span className="text-sm font-medium text-white/60">豆包文字聊天</span>
        <button
          onClick={() => setMessages([])}
          className="text-white/20 hover:text-white/50 transition-colors"
          title="清空对话"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/20 text-sm">发送消息开始对话</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-br-sm'
                  : 'bg-white/5 text-white/80 rounded-bl-sm'
              }`}
            >
              {msg.content}
              {msg.streaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-white/60 animate-pulse rounded-sm align-middle" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 resize-none outline-none min-h-[28px] max-h-[160px] py-0.5"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
