import React, { useRef, useEffect, useState } from 'react';
import { Send, Trash2, User, Bot } from 'lucide-react';
import { useChatStore, type ChatMessage } from '../../store/chatStore';
import { doubaoStreamChat } from '../../services/doubaoApi';

export function ChatView() {
  const { messages, conversationId, streamingId, addMessage, updateStreaming, finishStreaming, clearMessages, setConversationId } = useChatStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesRef.current) {
      const el = messagesRef.current;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (nearBottom || streamingId) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, streamingId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userId = addMessage({ role: 'user', content: text });
    setIsLoading(true);

    const history = messages.map(({ role, content }) => ({ role, content }));

    try {
      const assistantId = addMessage({ role: 'assistant', content: '', streaming: true });

      await doubaoStreamChat(
        history,
        conversationId,
        (delta, thinking) => {
          updateStreaming(assistantId, delta, thinking);
        },
        (finalText, newConvId, thinking) => {
          if (newConvId) setConversationId(newConvId);
          finishStreaming(assistantId, finalText, thinking);
        },
        (errMsg) => {
          finishStreaming(assistantId, `错误: ${errMsg}`);
        }
      );
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
    <div className="flex flex-col h-full bg-[#0e1015]">
      {/* 消息列表 */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center">
              <Bot size={22} className="text-violet-400" />
            </div>
            <p className="text-white/30 text-sm">发送消息开始对话</p>
          </div>
        ) : (
          <div className="space-y-5 max-w-2xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-[#161920] border border-[#1e2028] rounded-2xl px-3 py-2 focus-within:border-violet-500/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 resize-none outline-none min-h-[32px] max-h-[160px] py-1 leading-relaxed"
            />
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="text-white/20 hover:text-white/50 transition-colors p-1 shrink-0"
                title="清空对话"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3 items-start`}>
      {/* 头像 */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? 'bg-violet-600/20' : 'bg-[#161920] border border-[#1e2028]'
      }`}>
        {isUser
          ? <User size={14} className="text-violet-400" />
          : <Bot size={14} className="text-white/40" />
        }
      </div>

      {/* 气泡 */}
      <div className={`max-w-[72%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* 思考内容 */}
        {!isUser && msg.thinking && (
          <div className="text-[11px] text-white/30 px-3 py-2 rounded-lg border border-dashed border-white/10 bg-white/3 italic">
            <span className="text-white/20 mr-1">思考:</span>
            {msg.thinking}
          </div>
        )}

        {/* 消息内容 */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-violet-600 text-white rounded-br-md'
              : 'bg-[#161920] text-white/80 border border-[#1e2028] rounded-bl-md'
          }`}
        >
          {msg.content}
          {msg.streaming && (
            <span className="inline-block w-1 h-3.5 ml-0.5 bg-white/50 animate-pulse rounded-sm align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
