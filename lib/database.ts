/**
 * Database connection and operations for semantic search
 * Uses PostgreSQL with pgvector for vector similarity search
 */

import { Pool, PoolClient } from 'pg';
import { TextChunk } from './preprocessing';
import { SearchResult, SearchOptions } from './semantic-search';

// Database connection pool
let pool: Pool | null = null;

/**
 * Initialize database connection pool
 */
export function initializeDatabase(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }
  
  return pool;
}

/**
 * Get database connection from pool
 */
export async function getDbClient(): Promise<PoolClient> {
  const db = initializeDatabase();
  return await db.connect();
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Database operations for text chunks
 */
export class TextChunkDB {
  private pool: Pool;
  
  constructor() {
    this.pool = initializeDatabase();
  }

  /**
   * Save multiple text chunks to database
   */
  async saveChunks(chunks: TextChunk[]): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const insertQuery = `
        INSERT INTO text_chunks (
          work_id, part_number, chapter_number, section_number, paragraph_number,
          tref, canonical_ref, content_hebrew, content_english, chunk_type,
          word_count, character_count, embedding_hebrew, embedding_english,
          topic_keywords, complexity_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (tref) DO UPDATE SET
          content_hebrew = EXCLUDED.content_hebrew,
          content_english = EXCLUDED.content_english,
          embedding_hebrew = EXCLUDED.embedding_hebrew,
          embedding_english = EXCLUDED.embedding_english,
          topic_keywords = EXCLUDED.topic_keywords,
          complexity_score = EXCLUDED.complexity_score,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      for (const chunk of chunks) {
        await client.query(insertQuery, [
          chunk.workId,
          chunk.partNumber || null,
          chunk.chapterNumber || null,
          chunk.sectionNumber || null,
          chunk.paragraphNumber || null,
          chunk.tref,
          chunk.canonicalRef,
          chunk.contentHebrew || null,
          chunk.contentEnglish || null,
          chunk.chunkType,
          chunk.wordCount,
          chunk.characterCount,
          chunk.embeddingHebrew ? JSON.stringify(chunk.embeddingHebrew) : null,
          chunk.embeddingEnglish ? JSON.stringify(chunk.embeddingEnglish) : null,
          chunk.topicKeywords,
          chunk.complexityScore
        ]);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete all chunks for a specific work
   */
  async deleteWorkChunks(workId: number): Promise<void> {
    await this.pool.query('DELETE FROM text_chunks WHERE work_id = $1', [workId]);
  }

  /**
   * Get chunks by IDs (for cache hydration)
   */
  async getChunksByIds(chunkIds: number[]): Promise<Array<{chunk_id: number; work_id: number; work_title: string; author_name: string; tref: string; content_english: string; content_hebrew?: string; topic_keywords?: string[]}>> {
    const query = `
      SELECT 
        tc.id as chunk_id,
        tc.work_id,
        w.title as work_title,
        a.name as author_name,
        tc.tref,
        tc.content_english,
        tc.content_hebrew,
        tc.topic_keywords
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      JOIN authors a ON w.author_id = a.id
      WHERE tc.id = ANY($1)
    `;
    
    const result = await this.pool.query(query, [chunkIds]);
    return result.rows;
  }

  /**
   * Vector similarity search
   */
  async vectorSearch(queryEmbedding: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit || 10;
    const minSimilarity = options.minSimilarity || 0.0;
    
    let whereClause = 'tc.embedding_english IS NOT NULL';
    const params: (string | number[] | number)[] = [JSON.stringify(queryEmbedding)];
    let paramIndex = 2;
    
    if (options.workIds && options.workIds.length > 0) {
      whereClause += ` AND tc.work_id = ANY($${paramIndex})`;
      params.push(options.workIds);
      paramIndex++;
    }
    
    if (minSimilarity > 0) {
      whereClause += ` AND (1 - (tc.embedding_english <=> $1)) >= $${paramIndex}`;
      params.push(minSimilarity);
      paramIndex++;
    }
    
    const query = `
      SELECT 
        tc.id as chunk_id,
        tc.work_id,
        w.title as work_title,
        a.name as author_name,
        tc.tref,
        tc.content_english,
        tc.content_hebrew,
        tc.topic_keywords,
        (1 - (tc.embedding_english <=> $1)) as similarity
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      JOIN authors a ON w.author_id = a.id
      WHERE ${whereClause}
      ORDER BY tc.embedding_english <=> $1
      LIMIT ${limit}
    `;
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      chunkId: row.chunk_id,
      workId: row.work_id,
      workTitle: row.work_title,
      authorName: row.author_name,
      tref: row.tref,
      contentEnglish: row.content_english,
      contentHebrew: row.content_hebrew,
      similarity: row.similarity,
      searchType: 'vector' as const,
      matchedTerms: []
    }));
  }

  /**
   * Full-text search
   */
  async fulltextSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit || 10;
    
    // Convert query to PostgreSQL tsquery format
    const tsQuery = query
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `${term}:*`)
      .join(' & ');
    
    let whereClause = 'tc.search_vector_english @@ to_tsquery(\'english\', $1)';
    const params: (string | number[])[] = [tsQuery];
    let paramIndex = 2;
    
    if (options.workIds && options.workIds.length > 0) {
      whereClause += ` AND tc.work_id = ANY($${paramIndex})`;
      params.push(options.workIds);
      paramIndex++;
    }
    
    const sql = `
      SELECT 
        tc.id as chunk_id,
        tc.work_id,
        w.title as work_title,
        a.name as author_name,
        tc.tref,
        tc.content_english,
        tc.content_hebrew,
        tc.topic_keywords,
        ts_rank(tc.search_vector_english, to_tsquery('english', $1)) as relevance
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      JOIN authors a ON w.author_id = a.id
      WHERE ${whereClause}
      ORDER BY ts_rank(tc.search_vector_english, to_tsquery('english', $1)) DESC
      LIMIT ${limit}
    `;
    
    const result = await this.pool.query(sql, params);
    
    return result.rows.map(row => ({
      chunkId: row.chunk_id,
      workId: row.work_id,
      workTitle: row.work_title,
      authorName: row.author_name,
      tref: row.tref,
      contentEnglish: row.content_english,
      contentHebrew: row.content_hebrew,
      similarity: row.relevance,
      searchType: 'fulltext' as const,
      matchedTerms: this.extractMatchedTerms(query, row.content_english || '')
    }));
  }

  /**
   * Cache operations
   */
  async getCachedSearch(queryHash: string): Promise<{chunkIds: number[], scores: number[]} | null> {
    const result = await this.pool.query(
      'SELECT chunk_ids, scores FROM search_cache WHERE query_hash = $1 AND expires_at > NOW()',
      [queryHash]
    );
    
    if (result.rows.length > 0) {
      return {
        chunkIds: result.rows[0].chunk_ids,
        scores: result.rows[0].scores
      };
    }
    
    return null;
  }

  async setCachedSearch(
    queryHash: string, 
    queryText: string, 
    chunkIds: number[], 
    scores: number[]
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO search_cache (query_hash, query_text, chunk_ids, scores, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')
      ON CONFLICT (query_hash) DO UPDATE SET
        chunk_ids = $3, scores = $4, expires_at = NOW() + INTERVAL '1 hour'
    `, [queryHash, queryText, chunkIds, scores]);
  }

  /**
   * Helper method to extract matched terms
   */
  private extractMatchedTerms(query: string, content: string): string[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    
    return queryTerms.filter(term => 
      contentWords.some(word => word.includes(term) || term.includes(word))
    );
  }
}

/**
 * Works and Authors operations
 */
export class WorksDB {
  private pool: Pool;
  
  constructor() {
    this.pool = initializeDatabase();
  }

  /**
   * Create or get author
   */
  async ensureAuthor(name: string, hebrewName?: string): Promise<number> {
    // Check if author exists
    let result = await this.pool.query(
      'SELECT id FROM authors WHERE name = $1',
      [name]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    // Create new author
    result = await this.pool.query(
      'INSERT INTO authors (name, hebrew_name) VALUES ($1, $2) RETURNING id',
      [name, hebrewName || null]
    );
    
    return result.rows[0].id;
  }

  /**
   * Create or get work
   */
  async ensureWork(
    authorId: number,
    title: string,
    hebrewTitle?: string,
    alternativeTitles: string[] = [],
    description?: string,
    sefariaIndexTitle?: string
  ): Promise<number> {
    // Check if work exists
    let result = await this.pool.query(
      'SELECT id FROM works WHERE title = $1 AND author_id = $2',
      [title, authorId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    // Create new work
    result = await this.pool.query(`
      INSERT INTO works (author_id, title, hebrew_title, alternative_titles, description, sefaria_index_title)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [authorId, title, hebrewTitle || null, alternativeTitles, description || null, sefariaIndexTitle || null]);
    
    return result.rows[0].id;
  }

  /**
   * Get work by Sefaria index title
   */
  async getWorkBySefariaTitle(sefariaTitle: string): Promise<{id: number, title: string} | null> {
    const result = await this.pool.query(
      'SELECT id, title FROM works WHERE sefaria_index_title = $1',
      [sefariaTitle]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

// Export singleton instances
export const textChunkDB = new TextChunkDB();
export const worksDB = new WorksDB();