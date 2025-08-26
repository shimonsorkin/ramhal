'use client'

import { useState } from 'react'

interface Witness {
  tref: string
  text: string
}

interface AskResponse {
  question: string
  answer: string
  verifiedAnswer: string
  witnesses: Witness[]
  verification: {
    unsourcedSentences: number
    totalSentences: number
    sourcedSentences: number
    accuracy: number
  }
  metadata: {
    guesses: string[]
    witnessCount: number
    tokensUsed: number
    model: string
    timestamp: string
  }
}

interface ApiError {
  error: string
  message?: string
  details?: Array<{ field: string; message: string }>
}

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedWitness, setSelectedWitness] = useState<Witness | null>(null)
  const [verificationMode, setVerificationMode] = useState(false)

  const handleAsk = async () => {
    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: question.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        const apiError = data as ApiError
        if (apiError.details) {
          setError(`${apiError.error}: ${apiError.details.map(d => d.message).join(', ')}`)
        } else {
          setError(apiError.message || apiError.error || 'An error occurred')
        }
        return
      }

      setResult(data)
    } catch {
      setError('Failed to get an answer. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleAsk()
    }
  }

  // Extract tref references from answer text and make them clickable
  const renderAnswerWithClickableRefs = (answerText: string, witnesses: Witness[], isVerified = false) => {
    // Find all (tref) patterns in the answer
    const trefPattern = /\(([^)]+)\)/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = trefPattern.exec(answerText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        const textSegment = answerText.slice(lastIndex, match.index)
        // Handle warning symbols in verified mode
        if (isVerified && textSegment.includes('⚠️')) {
          const warningParts = textSegment.split('⚠️')
          warningParts.forEach((part, idx) => {
            if (idx > 0) {
              parts.push(<span key={`warning-${match.index}-${idx}`} className="text-orange-600 font-semibold">⚠️</span>)
            }
            if (part) parts.push(part)
          })
        } else {
          parts.push(textSegment)
        }
      }

      const trefText = match[1]
      
      // Handle special case for "(Needs source)" in verified mode
      if (trefText === 'Needs source' && isVerified) {
        parts.push(
          <span key={match.index} className="text-orange-600 text-sm font-medium">(Needs source)</span>
        )
      } else {
        const witness = witnesses.find(w => w.tref === trefText)
        
        if (witness) {
          // Clickable chip for valid tref
          parts.push(
            <button
              key={match.index}
              onClick={() => setSelectedWitness(witness)}
              className="inline-flex items-center px-2 py-1 mx-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            >
              {trefText}
            </button>
          )
        } else {
          // Non-clickable text for invalid trefs
          parts.push(`(${trefText})`)
        }
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < answerText.length) {
      parts.push(answerText.slice(lastIndex))
    }

    return parts
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Ask Ramchal
            </h1>
            <p className="text-gray-600">
              Ask questions about Rabbi Moshe Chaim Luzzatto's teachings and get answers sourced directly from his works.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
                Your Question
              </label>
              <textarea
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What does Ramchal say about divine providence?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={handleAsk}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Asking Ramchal...
                  </div>
                ) : (
                  'Ask Question'
                )}
              </button>
              
              <div className="flex items-center justify-center">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={verificationMode}
                    onChange={(e) => setVerificationMode(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    <span className="font-medium">Verification Mode</span> - Show citation warnings
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-1 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Answer</h2>
                  <div className="mt-1 text-sm text-gray-500">
                    Based on {result.metadata.witnessCount} passages • 
                    {result.metadata.tokensUsed} tokens • 
                    {result.metadata.model}
                  </div>
                </div>
                {result.verification && (
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-700">
                      Citation Accuracy
                    </div>
                    <div className="text-sm text-gray-500">
                      {result.verification.sourcedSentences}/{result.verification.totalSentences} sentences 
                      ({result.verification.accuracy.toFixed(0)}%)
                    </div>
                    {result.verification.unsourcedSentences > 0 && (
                      <div className="text-xs text-orange-600 mt-1">
                        {result.verification.unsourcedSentences} unsourced
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-6">
              {verificationMode && result.verification.unsourcedSentences > 0 && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <div className="flex items-center">
                    <span className="text-orange-600 font-semibold mr-2">⚠️</span>
                    <span className="text-sm text-orange-800">
                      Verification mode: Sentences without proper citations are marked with warnings
                    </span>
                  </div>
                </div>
              )}
              <div className="text-lg leading-relaxed text-gray-900 mb-6">
                {renderAnswerWithClickableRefs(
                  verificationMode ? result.verifiedAnswer : result.answer, 
                  result.witnesses, 
                  verificationMode
                )}
              </div>
              
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Sources Used:</h3>
                <div className="flex flex-wrap gap-2">
                  {result.witnesses.map((witness, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedWitness(witness)}
                      className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    >
                      {witness.tref}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal for witness excerpts */}
        {selectedWitness && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">{selectedWitness.tref}</h3>
                <button
                  onClick={() => setSelectedWitness(null)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-4 overflow-y-auto max-h-80">
                <div
                  className="text-sm leading-relaxed text-gray-700"
                  dangerouslySetInnerHTML={{ __html: selectedWitness.text }}
                />
              </div>
            </div>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Ask your first question</h3>
            <p className="mt-1 text-sm text-gray-500">Get answers directly from Ramchal's writings.</p>
          </div>
        )}
      </div>
    </div>
  )
}