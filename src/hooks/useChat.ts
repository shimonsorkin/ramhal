'use client'

import { useState, useEffect, useCallback } from 'react'

interface Witness {
  tref: string;
  text: string;
  hebrew?: string;
}

interface Verification {
  unsourcedSentences: number;
  totalSentences: number;
  sourcedSentences: number;
  accuracy: number;
  verifiedAnswer?: string;
}

interface MessageMetadata {
  guesses?: string[];
  witnessCount?: number;
  tokensUsed?: number;
  model?: string;
  searchMethod?: string;
  useSemanticSearch?: boolean;
  chatId?: string | null;
  timestamp: string;
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
  is_archived: boolean
}

interface ChatMessage {
  id: string
  chat_session_id: string
  role: 'user' | 'assistant'
  content: string
  witnesses?: Witness[]
  verification?: Verification
  metadata?: MessageMetadata
  created_at: string
  message_order: number
}

interface UseChatReturn {
  // Chat management
  chats: ChatSession[]
  activeChatId: string | null
  currentMessages: ChatMessage[]
  
  // Loading states
  loading: boolean
  loadingChats: boolean
  loadingMessages: boolean
  loadingMore: boolean
  
  // Pagination
  hasMore: boolean
  
  // Actions
  createNewChat: () => Promise<string | null>
  switchChat: (chatId: string) => Promise<void>
  deleteChat: (chatId: string) => Promise<void>
  updateChatTitle: (chatId: string, title: string) => Promise<void>
  sendMessage: (content: string, useSemanticSearch?: boolean) => Promise<void>
  loadMoreMessages: () => Promise<void>
  refreshChats: () => Promise<void>
  
  // Error handling
  error: string | null
  clearError: () => void
}

export function useChat(initialChatId?: string): UseChatReturn {
  const [chats, setChats] = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId || null)
  const [currentMessages, setCurrentMessages] = useState<ChatMessage[]>([])
  
  // Loading states
  const [loading, setLoading] = useState(false)
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  
  // Pagination
  const [hasMore, setHasMore] = useState(false)
  const [messageOffset, setMessageOffset] = useState(0)
  
  // Error handling
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Load all chats
  const refreshChats = useCallback(async () => {
    setLoadingChats(true)
    try {
      const response = await fetch('/api/chat')
      if (!response.ok) {
        throw new Error('Failed to load chats')
      }
      const data = await response.json()
      setChats(data)
    } catch (err) {
      console.error('Error loading chats:', err)
      setError('Failed to load chats')
    } finally {
      setLoadingChats(false)
    }
  }, [])

  // Load messages for a specific chat
  const loadChatMessages = useCallback(async (chatId: string, offset = 0, limit = 50) => {
    if (offset === 0) {
      setLoadingMessages(true)
    } else {
      setLoadingMore(true)
    }
    
    try {
      const response = await fetch(`/api/chat/${chatId}/message?limit=${limit}&offset=${offset}&order=asc`)
      if (!response.ok) {
        throw new Error('Failed to load messages')
      }
      const messages = await response.json()
      
      if (offset === 0) {
        setCurrentMessages(messages)
        setMessageOffset(messages.length)
      } else {
        setCurrentMessages(prev => [...messages, ...prev])
        setMessageOffset(prev => prev + messages.length)
      }
      
      setHasMore(messages.length === limit)
    } catch (err) {
      console.error('Error loading messages:', err)
      setError('Failed to load messages')
    } finally {
      setLoadingMessages(false)
      setLoadingMore(false)
    }
  }, [])

  // Create new chat
  const createNewChat = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'New Chat' }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to create chat')
      }
      
      const newChat = await response.json()
      setChats(prev => [newChat, ...prev])
      return newChat.id
    } catch (err) {
      console.error('Error creating chat:', err)
      setError('Failed to create new chat')
      return null
    }
  }, [])

  // Switch to a different chat
  const switchChat = useCallback(async (chatId: string) => {
    setActiveChatId(chatId)
    setCurrentMessages([])
    setMessageOffset(0)
    setHasMore(false)
    await loadChatMessages(chatId)
  }, [loadChatMessages])

  // Delete a chat
  const deleteChat = useCallback(async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete chat')
      }
      
      setChats(prev => prev.filter(chat => chat.id !== chatId))
      
      // If we deleted the active chat, clear it
      if (activeChatId === chatId) {
        setActiveChatId(null)
        setCurrentMessages([])
        setMessageOffset(0)
        setHasMore(false)
      }
    } catch (err) {
      console.error('Error deleting chat:', err)
      setError('Failed to delete chat')
    }
  }, [activeChatId])

  // Update chat title
  const updateChatTitle = useCallback(async (chatId: string, title: string) => {
    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update chat title')
      }
      
      const updatedChat = await response.json()
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? updatedChat : chat
      ))
    } catch (err) {
      console.error('Error updating chat title:', err)
      setError('Failed to update chat title')
    }
  }, [])

  // Send a message
  const sendMessage = useCallback(async (content: string, useSemanticSearch = true) => {
    if (!activeChatId) {
      setError('No active chat selected')
      return
    }

    setLoading(true)
    
    // Add user message to UI immediately
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      chat_session_id: activeChatId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      message_order: currentMessages.length
    }
    
    setCurrentMessages(prev => [...prev, tempUserMessage])
    
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: content,
          useSemanticSearch,
          chatId: activeChatId
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to send message')
      }
      
      // Remove temp message and reload chat to get actual messages from server
      setCurrentMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id))
      await loadChatMessages(activeChatId)
      
      // Refresh chat list to update timestamps
      await refreshChats()
    } catch (err) {
      console.error('Error sending message:', err)
      setError('Failed to send message')
      // Remove temp message on error
      setCurrentMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id))
    } finally {
      setLoading(false)
    }
  }, [activeChatId, currentMessages.length, loadChatMessages, refreshChats])

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!activeChatId || !hasMore || loadingMore) {
      return
    }
    
    await loadChatMessages(activeChatId, messageOffset)
  }, [activeChatId, hasMore, loadingMore, messageOffset, loadChatMessages])

  // Initial load
  useEffect(() => {
    refreshChats()
  }, [refreshChats])

  // Load initial chat if provided
  useEffect(() => {
    if (initialChatId && chats.some(chat => chat.id === initialChatId)) {
      switchChat(initialChatId)
    }
  }, [initialChatId, chats, switchChat])

  return {
    // State
    chats,
    activeChatId,
    currentMessages,
    
    // Loading states
    loading,
    loadingChats,
    loadingMessages,
    loadingMore,
    
    // Pagination
    hasMore,
    
    // Actions
    createNewChat,
    switchChat,
    deleteChat,
    updateChatTitle,
    sendMessage,
    loadMoreMessages,
    refreshChats,
    
    // Error handling
    error,
    clearError
  }
}