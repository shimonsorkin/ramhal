'use client'

import { useState } from 'react'
import RichContent from './RichContent'

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

interface MessageBubbleProps {
  message: ChatMessage
  onWitnessClick?: (witness: Witness) => void
  showVerificationMode?: boolean
}

export default function MessageBubble({
  message,
  onWitnessClick,
  showVerificationMode = false
}: MessageBubbleProps) {
  const [showMetadata, setShowMetadata] = useState(false)

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-3xl">
          <div className="bg-blue-600 text-white rounded-lg px-4 py-2 shadow-sm">
            <p className="text-sm md:text-base whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="text-xs text-gray-500 mt-1 text-right">
            {formatTimestamp(message.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-4xl w-full">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          {/* Header with metadata toggle */}
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-900">Ramchal</span>
              {message.metadata && (
                <span className="text-xs text-gray-500">
                  {message.metadata.witnessCount} sources • {message.metadata.tokensUsed} tokens
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {message.verification && (
                <div className="text-xs text-gray-500">
                  {message.verification.accuracy.toFixed(0)}% verified
                </div>
              )}
              <button
                onClick={() => setShowMetadata(!showMetadata)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Toggle metadata"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Verification warning */}
          {showVerificationMode && message.verification && message.verification.unsourcedSentences > 0 && (
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
              <div className="flex items-center">
                <span className="text-orange-600 font-semibold mr-2">⚠️</span>
                <span className="text-sm text-orange-800">
                  Verification mode: {message.verification.unsourcedSentences} sentences lack proper citations
                </span>
              </div>
            </div>
          )}

          {/* Message content */}
          <div className="px-4 py-4">
            <RichContent 
              content={showVerificationMode && message.verification?.verifiedAnswer 
                ? message.verification.verifiedAnswer 
                : message.content}
              className="prose prose-sm max-w-none"
              witnesses={message.witnesses}
              onWitnessClick={onWitnessClick}
              isVerified={showVerificationMode}
            />
          </div>

          {/* Sources */}
          {message.witnesses && message.witnesses.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Sources:</h4>
              <div className="flex flex-wrap gap-2">
                {message.witnesses.map((witness, index) => (
                  <button
                    key={index}
                    onClick={() => onWitnessClick?.(witness)}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                  >
                    {witness.tref}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Metadata (collapsible) */}
          {showMetadata && message.metadata && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
              <div className="grid grid-cols-2 gap-2">
                {message.metadata.model && (
                  <div>
                    <strong>Model:</strong> {message.metadata.model}
                  </div>
                )}
                {message.metadata.searchMethod && (
                  <div>
                    <strong>Search:</strong> {message.metadata.searchMethod}
                  </div>
                )}
                {message.metadata.tokensUsed && (
                  <div>
                    <strong>Tokens:</strong> {message.metadata.tokensUsed.toLocaleString()}
                  </div>
                )}
                {message.metadata.witnessCount && (
                  <div>
                    <strong>Sources:</strong> {message.metadata.witnessCount}
                  </div>
                )}
                <div className="col-span-2">
                  <strong>Generated:</strong> {formatTimestamp(message.metadata.timestamp)}
                </div>
                {message.metadata.guesses && message.metadata.guesses.length > 0 && (
                  <div className="col-span-2">
                    <strong>Search terms:</strong> {message.metadata.guesses.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
            {formatTimestamp(message.created_at)}
          </div>
        </div>
      </div>
    </div>
  )
}