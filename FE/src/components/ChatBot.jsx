import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, User, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendChatMessage } from '../lib/chatbotService.js';

const WELCOME = 'Xin chào! Tôi là trợ lý AI của AutoWashPro 🚗\nTôi có thể tư vấn dịch vụ và giúp bạn đặt lịch rửa xe. Bạn cần hỗ trợ gì?';

export default function ChatBot() {
  const location = useLocation();

  // Hide chatbot on Admin and Manager portal routes
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/manager')) {
    return null;
  }

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'bot', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 100);
    }
  }, [messages, open]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const reply = await sendChatMessage(text);
      setMessages(prev => [...prev, { role: 'bot', text: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: `Xin lỗi, có lỗi xảy ra: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-[360px] sm:w-[400px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col mb-4 overflow-hidden border border-slate-100"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30">
                  <Bot className="text-white w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm tracking-wide flex items-center gap-1.5">
                    AutoWashPro AI <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  </h3>
                  <p className="text-emerald-50 text-xs font-medium opacity-90">Trợ lý đặt lịch thông minh</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/50">
              {messages.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i}
                  className={`flex gap-3 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'bot' && (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mb-1 border border-emerald-200">
                      <Bot className="w-4 h-4 text-emerald-600" />
                    </div>
                  )}
                  
                  <div className={`max-w-[75%] px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm' 
                      : 'bg-white text-slate-700 rounded-2xl rounded-tl-sm border border-slate-100'
                  }`}>
                    {msg.role === 'user' ? (
                      <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                    ) : (
                      <div className="text-[14px] leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2 [&_a]:font-medium [&_a:hover]:text-blue-800 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:text-xs [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer">
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <div className="flex gap-3 items-end">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mb-1 border border-emerald-200">
                    <Bot className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="bg-white px-4 py-3.5 rounded-2xl rounded-tl-sm border border-slate-100 shadow-sm">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-slate-100 shrink-0">
              <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                <textarea
                  ref={(el) => { inputRef.current = el; textareaRef.current = el; }}
                  value={input}
                  onChange={e => { setInput(e.target.value); autoResize(); }}
                  onKeyDown={handleKey}
                  placeholder="Hỏi AutoWashPro AI..."
                  rows={1}
                  className="flex-1 max-h-[120px] bg-transparent resize-none outline-none py-2 px-3 text-sm text-slate-700 placeholder-slate-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center mb-0.5 mr-0.5 transition-all ${
                    !input.trim() || loading 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:shadow-md hover:-translate-y-0.5 active:scale-95'
                  }`}
                >
                  <Send size={16} className={input.trim() && !loading ? 'ml-0.5' : ''} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(p => !p)}
        className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-colors duration-300 ${
          open ? 'bg-slate-800 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
        }`}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X size={24} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageSquare size={24} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
