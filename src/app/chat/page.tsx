'use client'

import { useState } from 'react'
import { useChat } from '../../hooks/useChat'
import ChatSidebar from '../../components/ChatSidebar'
import MessageList from '../../components/MessageList'
import RichContent from '../../components/RichContent'

interface Witness {
  tref: string
  text: string
}

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [selectedWitness, setSelectedWitness] = useState<Witness | null>(null)
  const [verificationMode, setVerificationMode] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const {
    chats,
    activeChatId,
    currentMessages,
    loading,
    loadingChats,
    loadingMessages,
    loadingMore,
    hasMore,
    createNewChat,
    switchChat,
    deleteChat,
    updateChatTitle,
    sendMessage,
    loadMoreMessages,
    error,
    clearError
  } = useChat()

  const handleNewChat = async () => {
    const newChatId = await createNewChat()
    if (newChatId) {
      await switchChat(newChatId)
    }
  }

  const handleSendMessage = async () => {
    if (!question.trim()) {
      return
    }

    const messageContent = question.trim()
    setQuestion('')

    // Create new chat if none is active
    let chatId = activeChatId
    if (!chatId) {
      chatId = await createNewChat()
      if (chatId) {
        await switchChat(chatId)
      } else {
        return
      }
    }

    await sendMessage(messageContent, true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'w-0' : 'w-80'}`}>
        {!sidebarCollapsed && (
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            onChatSelect={switchChat}
            onNewChat={handleNewChat}
            onDeleteChat={deleteChat}
            onEditChatTitle={updateChatTitle}
            loading={loadingChats}
          />
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sidebarCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                )}
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Ask Ramchal
              </h1>
              <p className="text-sm text-gray-500">
                {activeChatId 
                  ? `Chat with Rabbi Moshe Chaim Luzzatto's teachings`
                  : 'Select a chat or start a new conversation'
                }
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={verificationMode}
                onChange={(e) => setVerificationMode(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                <span className="font-medium">Verification Mode</span>
              </span>
            </label>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex justify-between items-center">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 flex flex-col min-h-0">
          <MessageList
            messages={currentMessages}
            loading={loadingMessages || loading}
            onWitnessClick={setSelectedWitness}
            showVerificationMode={verificationMode}
            onLoadMore={loadMoreMessages}
            hasMore={hasMore}
            loadingMore={loadingMore}
          />
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex space-x-4">
              <div className="flex-1">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeChatId 
                    ? "Ask a follow-up question..." 
                    : "What does Ramchal say about divine providence?"
                  }
                  rows={1}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
                  style={{
                    minHeight: '50px',
                    maxHeight: '150px',
                    height: 'auto'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = target.scrollHeight + 'px'
                  }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={loading || !question.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-w-[100px]"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending
                  </div>
                ) : (
                  'Send'
                )}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </div>
      </div>

      {/* Witness Modal */}
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
              <RichContent 
                content={selectedWitness.text}
                className="prose prose-sm max-w-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}