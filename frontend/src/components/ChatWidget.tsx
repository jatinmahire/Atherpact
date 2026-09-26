/**
 * AetherPact — Floating AI Search Chat Widget.
 * Wired to the real /chat endpoint (Laya intent → /match or fallback).
 * Loading state is tied to the actual in-flight request.
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { chatAPI } from '../api/client'
import type { MatchResultItem } from '../api/client'
import MatchCard from './MatchCard'

interface Message {
  role: 'user' | 'assistant'
  content: string
  results?: MatchResultItem[]
}

export default function ChatWidget() {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I can help you find hospitality resources. Try: "I need a commercial kitchen in Bandra for ₹10,000/day"' }
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const res = await chatAPI.send(msg)
      const { intent, match_results, fallback_message } = res.data

      if (intent === 'resource_search' && match_results && match_results.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Found ${match_results.length} matching resources:`,
            results: match_results,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: fallback_message ?? 'I can help you find hospitality resources. Try describing what you need.',
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I had trouble connecting to the server. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-navy text-espresso p-4 rounded-full shadow-lg hover:bg-navy-light transition-colors"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        style={{ display: open ? 'none' : 'flex', alignItems: 'center', gap: 8 }}
      >
        <MessageCircle size={22} />
        <span className="text-sm font-medium pr-1">AI Search</span>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="glass-surface--on-stone fixed bottom-6 right-6 z-50 w-[420px] max-h-[600px] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-navy text-espresso">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} />
                <span className="font-semibold text-sm">AetherPact AI Search</span>
                <span className="text-xs bg-espresso/15 px-2 py-0.5 rounded-full">Laya-powered</span>
              </div>
              <button onClick={() => setOpen(false)} className="hover:opacity-75">
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] ${msg.role === 'user'
                    ? 'bg-navy text-espresso rounded-2xl rounded-tr-sm px-3 py-2 text-sm'
                    : 'text-warm-white/90 text-sm'
                  }`}>
                    {msg.content}
                    {msg.results && (
                      <div className="mt-3 space-y-3">
                        {msg.results.slice(0, 3).map((item, j) => (
                          <MatchCard key={j} item={item} rank={j} />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator — tied to real in-flight request */}
              {loading && (
                <div className="flex items-center gap-2 text-warm-white/50 text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Searching resources…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-warm-white/15 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Describe what you need…"
                className="flex-1 text-sm border border-warm-white/20 bg-espresso/20 text-warm-white placeholder:text-warm-white/40 rounded-xl px-3 py-2 focus:outline-none focus:border-brass"
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="bg-navy text-espresso p-2 rounded-xl disabled:opacity-40 hover:bg-navy-light transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
