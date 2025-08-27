/**
 * Semantic search engine implementation
 * Core replacement for JSON-based RAG system
 */

import OpenAI from 'openai';
import { textChunkDB } from './database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  includeHebrew?: boolean;
  includeEnglish?: boolean;
  workIds?: number[];
  authorIds?: number[];
  useHybridSearch?: boolean;
  boostRecent?: boolean;
}

export interface SearchResult {
  chunkId: number;
  workId: number;
  workTitle: string;
  authorName: string;
  tref: string;
  contentEnglish?: string;
  contentHebrew?: string;
  similarity: number;
  searchType: 'vector' | 'fulltext' | 'hybrid';
  matchedTerms: string[];
}

export interface SearchAnalytics {
  queryTime: number;
  totalResults: number;
  vectorResults: number;
  fulltextResults: number;
  cacheHit: boolean;
}

/**
 * Main semantic search engine
 */
export class SemanticSearchEngine {
  constructor() {
    // Database operations handled by imported textChunkDB
  }

  /**
   * Main search method - entry point for all searches
   */
  public async search(
    query: string, 
    options: SearchOptions = {}
  ): Promise<{ results: SearchResult[]; analytics: SearchAnalytics }> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(query, options);
    const cached = await this.getCachedResults(cacheKey);
    
    if (cached) {
      return {
        results: cached,
        analytics: {
          queryTime: Date.now() - startTime,
          totalResults: cached.length,
          vectorResults: 0,
          fulltextResults: 0,
          cacheHit: true
        }
      };
    }

    // Determine search strategy
    let results: SearchResult[];
    
    if (options.useHybridSearch !== false) {
      results = await this.hybridSearch(query, options);
    } else {
      results = await this.vectorSearch(query, options);
    }

    // Cache results
    await this.cacheResults(cacheKey, results);

    return {
      results,
      analytics: {
        queryTime: Date.now() - startTime,
        totalResults: results.length,
        vectorResults: results.filter(r => r.searchType === 'vector').length,
        fulltextResults: results.filter(r => r.searchType === 'fulltext').length,
        cacheHit: false
      }
    };
  }

  /**
   * Vector similarity search using embeddings
   */
  private async vectorSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Generate embedding for query
    const queryEmbedding = await this.generateQueryEmbedding(query);
    
    // Use database operations
    return await textChunkDB.vectorSearch(queryEmbedding, options);
  }

  /**
   * Full-text search using PostgreSQL's built-in capabilities
   */
  private async fulltextSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Use database operations
    return await textChunkDB.fulltextSearch(query, options);
  }

  /**
   * Hybrid search combining vector similarity and full-text search
   */
  private async hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Run both searches in parallel
    const [vectorResults, fulltextResults] = await Promise.all([
      this.vectorSearch(query, { ...options, limit: (options.limit || 10) * 2 }),
      this.fulltextSearch(query, { ...options, limit: (options.limit || 10) * 2 })
    ]);

    // Combine and rerank results
    const combined = await this.combineAndRerank(vectorResults, fulltextResults, query);
    
    return combined.slice(0, options.limit || 10);
  }

  /**
   * Combine vector and fulltext results with smart reranking
   */
  private async combineAndRerank(
    vectorResults: SearchResult[], 
    fulltextResults: SearchResult[], 
    query: string
  ): Promise<SearchResult[]> {
    // Create a map to merge duplicate chunks
    const resultMap = new Map<number, SearchResult>();

    // Add vector results
    vectorResults.forEach(result => {
      resultMap.set(result.chunkId, {
        ...result,
        searchType: 'vector' as const
      });
    });

    // Add fulltext results, boosting if already found via vector
    fulltextResults.forEach(result => {
      const existing = resultMap.get(result.chunkId);
      if (existing) {
        // Hybrid match - boost similarity score
        resultMap.set(result.chunkId, {
          ...existing,
          similarity: Math.min(1.0, existing.similarity * 1.3), // 30% boost
          searchType: 'hybrid' as const,
          matchedTerms: [...existing.matchedTerms, ...result.matchedTerms]
        });
      } else {
        resultMap.set(result.chunkId, {
          ...result,
          searchType: 'fulltext' as const
        });
      }
    });

    // Convert back to array and sort by similarity
    return Array.from(resultMap.values())
      .sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Generate embedding for search query
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating query embedding:', error);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Extract terms that matched in full-text search
   */
  private extractMatchedTerms(query: string, content: string): string[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    
    return queryTerms.filter(term => 
      contentWords.some(word => word.includes(term) || term.includes(word))
    );
  }

  /**
   * Generate cache key for query and options
   */
  private generateCacheKey(query: string, options: SearchOptions): string {
    const normalizedQuery = query.toLowerCase().trim();
    const optionsStr = JSON.stringify(options);
    return Buffer.from(normalizedQuery + optionsStr).toString('base64');
  }

  /**
   * Get cached search results
   */
  private async getCachedResults(cacheKey: string): Promise<SearchResult[] | null> {
    try {
      const cached = await textChunkDB.getCachedSearch(cacheKey);
      if (cached) {
        return await this.hydrateCachedResults(cached.chunkIds, cached.scores);
      }
      return null;
    } catch (error) {
      console.warn('Cache lookup failed:', error);
      return null;
    }
  }

  /**
   * Cache search results
   */
  private async cacheResults(cacheKey: string, results: SearchResult[]): Promise<void> {
    try {
      const chunkIds = results.map(r => r.chunkId);
      const scores = results.map(r => r.similarity);
      
      await textChunkDB.setCachedSearch(cacheKey, 'query-text', chunkIds, scores);
    } catch (error) {
      console.warn('Cache write failed:', error);
      // Don't throw - caching is optional
    }
  }

  /**
   * Reconstruct full results from cached chunk IDs
   */
  private async hydrateCachedResults(chunkIds: number[], scores: number[]): Promise<SearchResult[]> {
    const rows = await textChunkDB.getChunksByIds(chunkIds);
    
    // Reconstruct in original order with cached scores
    return chunkIds.map((chunkId, index) => {
      const row = rows.find((r: {chunk_id: number; work_id: number; work_title: string; author_name: string; tref: string; content_english: string; content_hebrew?: string; topic_keywords?: string[]}) => r.chunk_id === chunkId);
      if (!row) return null;
      
      return {
        chunkId: row.chunk_id,
        workId: row.work_id,
        workTitle: row.work_title,
        authorName: row.author_name,
        tref: row.tref,
        contentEnglish: row.content_english,
        contentHebrew: row.content_hebrew,
        similarity: scores[index],
        searchType: 'hybrid' as const,
        matchedTerms: []
      };
    }).filter(Boolean) as SearchResult[];
  }
}

/**
 * Query expansion using LLM to find related concepts
 */
export class QueryExpander {
  public async expandQuery(query: string): Promise<string[]> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'system',
          content: 'Given a query about Jewish texts, generate 5 related terms or concepts that might appear in relevant passages. Return only the terms, one per line.'
        }, {
          role: 'user',
          content: query
        }],
        max_tokens: 100,
        temperature: 0.3
      });

      const expanded = response.choices[0].message.content
        ?.split('\n')
        .map(term => term.trim())
        .filter(term => term.length > 0) || [];

      return [query, ...expanded];
    } catch (error) {
      console.warn('Query expansion failed:', error);
      return [query]; // Fallback to original query
    }
  }
}