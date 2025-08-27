/**
 * Database operations for chat sessions and messages
 * Extends the existing database layer with chat functionality
 */

import { initializeDatabase, getDbClient } from './database';

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
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  is_archived: boolean;
}

export interface ChatMessage {
  id: string;
  chat_session_id: string;
  role: 'user' | 'assistant';
  content: string;
  witnesses?: Witness[];
  verification?: Verification;
  metadata?: MessageMetadata;
  created_at: string;
  message_order: number;
}

export interface CreateChatRequest {
  title?: string;
  user_id?: string;
}

export interface CreateMessageRequest {
  chat_session_id: string;
  role: 'user' | 'assistant';
  content: string;
  witnesses?: Witness[];
  verification?: Verification;
  metadata?: MessageMetadata;
}

/**
 * Chat database operations
 */
export class ChatDB {
  private pool = initializeDatabase();

  /**
   * Create a new chat session
   */
  async createChat(request: CreateChatRequest): Promise<ChatSession> {
    const client = await getDbClient();
    
    try {
      const result = await client.query(
        'INSERT INTO chat_sessions (title, user_id) VALUES ($1, $2) RETURNING *',
        [request.title || 'New Chat', request.user_id || null]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get all chat sessions for a user (or all if no user_id provided)
   */
  async getChats(user_id?: string, includeArchived = false): Promise<ChatSession[]> {
    const client = await getDbClient();
    
    try {
      let query = 'SELECT * FROM chat_sessions';
      const params: (string | boolean)[] = [];
      const conditions: string[] = [];

      if (user_id) {
        conditions.push('user_id = $1');
        params.push(user_id);
      }

      if (!includeArchived) {
        conditions.push(`is_archived = $${params.length + 1}`);
        params.push(false);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY updated_at DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get a specific chat session with its messages
   */
  async getChat(chatId: string, messageLimit?: number): Promise<{
    session: ChatSession | null;
    messages: ChatMessage[];
  }> {
    const client = await getDbClient();
    
    try {
      // Get session
      const sessionResult = await client.query(
        'SELECT * FROM chat_sessions WHERE id = $1',
        [chatId]
      );

      if (sessionResult.rows.length === 0) {
        return { session: null, messages: [] };
      }

      // Get messages
      let messagesQuery = `
        SELECT * FROM chat_messages 
        WHERE chat_session_id = $1 
        ORDER BY message_order ASC
      `;
      
      const messagesParams: (string | number)[] = [chatId];
      
      if (messageLimit) {
        messagesQuery += ` LIMIT $2`;
        messagesParams.push(messageLimit);
      }

      const messagesResult = await client.query(messagesQuery, messagesParams);

      return {
        session: sessionResult.rows[0],
        messages: messagesResult.rows
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update chat session title
   */
  async updateChatTitle(chatId: string, title: string): Promise<ChatSession | null> {
    const client = await getDbClient();
    
    try {
      const result = await client.query(
        'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [title, chatId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Archive/unarchive a chat session
   */
  async archiveChat(chatId: string, archived = true): Promise<ChatSession | null> {
    const client = await getDbClient();
    
    try {
      const result = await client.query(
        'UPDATE chat_sessions SET is_archived = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [archived, chatId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a chat session and all its messages
   */
  async deleteChat(chatId: string): Promise<boolean> {
    const client = await getDbClient();
    
    try {
      const result = await client.query(
        'DELETE FROM chat_sessions WHERE id = $1',
        [chatId]
      );

      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Add a message to a chat session
   */
  async addMessage(request: CreateMessageRequest): Promise<ChatMessage> {
    const client = await getDbClient();
    
    try {
      await client.query('BEGIN');

      // Get the next message order for this chat
      const orderResult = await client.query(
        'SELECT COALESCE(MAX(message_order), 0) + 1 as next_order FROM chat_messages WHERE chat_session_id = $1',
        [request.chat_session_id]
      );
      
      const nextOrder = orderResult.rows[0].next_order;

      // Insert the message
      const result = await client.query(`
        INSERT INTO chat_messages (
          chat_session_id, role, content, witnesses, verification, metadata, message_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
      `, [
        request.chat_session_id,
        request.role,
        request.content,
        request.witnesses ? JSON.stringify(request.witnesses) : null,
        request.verification ? JSON.stringify(request.verification) : null,
        request.metadata ? JSON.stringify(request.metadata) : null,
        nextOrder
      ]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get messages for a chat session with pagination
   */
  async getMessages(
    chatId: string, 
    limit = 50, 
    offset = 0,
    order: 'asc' | 'desc' = 'asc'
  ): Promise<ChatMessage[]> {
    const client = await getDbClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM chat_messages 
        WHERE chat_session_id = $1 
        ORDER BY message_order ${order.toUpperCase()}
        LIMIT $2 OFFSET $3
      `, [chatId, limit, offset]);

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Generate auto-title from first user message
   */
  generateAutoTitle(firstMessage: string): string {
    // Take first 50 characters and add ellipsis if longer
    const maxLength = 50;
    const cleaned = firstMessage.trim().replace(/\s+/g, ' ');
    
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    
    return cleaned.substring(0, maxLength).trim() + '...';
  }

  /**
   * Update chat title based on first message if it's still "New Chat"
   */
  async updateAutoTitle(chatId: string, firstMessage: string): Promise<ChatSession | null> {
    const client = await getDbClient();
    
    try {
      // Only update if current title is "New Chat"
      const autoTitle = this.generateAutoTitle(firstMessage);
      const result = await client.query(`
        UPDATE chat_sessions 
        SET title = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2 AND title = 'New Chat'
        RETURNING *
      `, [autoTitle, chatId]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Get chat statistics
   */
  async getChatStats(chatId: string): Promise<{
    messageCount: number;
    firstMessageAt: string | null;
    lastMessageAt: string | null;
  }> {
    const client = await getDbClient();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as message_count,
          MIN(created_at) as first_message_at,
          MAX(created_at) as last_message_at
        FROM chat_messages 
        WHERE chat_session_id = $1
      `, [chatId]);

      const row = result.rows[0];
      return {
        messageCount: parseInt(row.message_count),
        firstMessageAt: row.first_message_at,
        lastMessageAt: row.last_message_at
      };
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const chatDB = new ChatDB();