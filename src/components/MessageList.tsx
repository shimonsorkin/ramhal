'use client'

import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'

interface Witness {
  tref: string
  text: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  witnesses?: Witness[]
  verification?: {
    unsourcedSentences: number
    totalSentences: number
    sourcedSentences: number
    accuracy: number
    verifiedAnswer?: string
  }
  metadata?: {
    guesses?: string[]
    witnessCount?: number
    tokensUsed?: number
    model?: string
    searchMethod?: string
    timestamp: string
  }
  created_at: string
}

interface MessageListProps {
  messages: ChatMessage[]
  loading?: boolean
  onWitnessClick?: (witness: Witness) => void
  showVerificationMode?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  loadingMore?: boolean
}

export default function MessageList({
  messages,
  loading = false,
  onWitnessClick,
  showVerificationMode = false,
  onLoadMore,
  hasMore = false,
  loadingMore = false
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current && !loadingMore) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, loadingMore])

  // Handle scroll to load more messages
  const handleScroll = () => {
    if (containerRef.current && onLoadMore && hasMore && !loadingMore) {
      const { scrollTop } = containerRef.current
      if (scrollTop === 0) {
        onLoadMore()
      }
    }
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">Start a conversation</h3>
          <p className="mt-1 text-gray-500">Ask your first question to begin chatting with Ramchal.</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-6"
      onScroll={handleScroll}
    >
      {/* Load more indicator */}
      {loadingMore && (
        <div className="text-center py-4">
          <svg className="animate-spin h-6 w-6 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}

      {/* Load more button */}
      {hasMore && !loadingMore && (
        <div className="text-center py-4">
          <button
            onClick={onLoadMore}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Load older messages
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-1">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onWitnessClick={onWitnessClick}
            showVerificationMode={showVerificationMode}
          />
        ))}
      </div>

      {/* Current loading indicator */}
      {loading && messages.length > 0 && (
        <div className="flex justify-start mb-6">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3">
            <div className="flex items-center space-x-2">
              <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm text-gray-500">Ramchal is thinking...</span>
            </div>
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}