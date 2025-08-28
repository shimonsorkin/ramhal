'use client'

import { useState } from 'react'

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
  is_archived: boolean
}

interface ChatSidebarProps {
  chats: ChatSession[]
  activeChatId: string | null
  onChatSelect: (chatId: string) => void
  onNewChat: () => void
  onDeleteChat: (chatId: string) => void
  onEditChatTitle: (chatId: string, newTitle: string) => void
  loading?: boolean
}

export default function ChatSidebar({
  chats,
  activeChatId,
  onChatSelect,
  onNewChat,
  onDeleteChat,
  onEditChatTitle,
  loading = false
}: ChatSidebarProps) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleEditStart = (chat: ChatSession) => {
    setEditingChatId(chat.id)
    setEditingTitle(chat.title)
  }

  const handleEditSave = async () => {
    if (editingChatId && editingTitle.trim()) {
      await onEditChatTitle(editingChatId, editingTitle.trim())
      setEditingChatId(null)
      setEditingTitle('')
    }
  }

  const handleEditCancel = () => {
    setEditingChatId(null)
    setEditingTitle('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave()
    } else if (e.key === 'Escape') {
      handleEditCancel()
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  // Strip markdown syntax from titles
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/^#+\s+/, '') // Remove heading markers (# ## ###)
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
      .replace(/\*(.*?)\*/g, '$1') // Remove italic *text*
      .replace(/`(.*?)`/g, '$1') // Remove inline code `text`
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links [text](url) 
      .trim()
  }

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewChat}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating...
            </div>
          ) : (
            '+ New Chat'
          )}
        </button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading chats...
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchTerm ? 'No chats match your search' : 'No chats yet. Start a new conversation!'}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredChats.map((chat) => (
              <div
                key={chat.id}
                className={`group relative rounded-md p-3 cursor-pointer transition-colors ${
                  activeChatId === chat.id
                    ? 'bg-blue-100 border border-blue-200'
                    : 'hover:bg-gray-100'
                }`}
                onClick={() => onChatSelect(chat.id)}
              >
                {editingChatId === chat.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={handleEditSave}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-transparent border-none outline-none font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 rounded px-1"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="pr-8">
                    <div className="font-medium text-gray-900 truncate">
                      {stripMarkdown(chat.title)}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatDate(chat.updated_at)}
                    </p>
                  </div>
                )}

                {/* Action buttons - show on hover or when active */}
                <div className={`absolute top-2 right-2 flex space-x-1 ${
                  activeChatId === chat.id || editingChatId === chat.id 
                    ? 'opacity-100' 
                    : 'opacity-0 group-hover:opacity-100'
                } transition-opacity`}>
                  {editingChatId !== chat.id && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditStart(chat)
                        }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                        title="Edit title"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Are you sure you want to delete this chat?')) {
                            onDeleteChat(chat.id)
                          }
                        }}
                        className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600"
                        title="Delete chat"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-500">
          {chats.length} chat{chats.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}