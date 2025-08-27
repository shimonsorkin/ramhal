/**
 * Semantic RAG system - replacement for JSON-based RAG
 * Drop-in replacement for bootstrapRAG that uses vector search
 */

import { SemanticSearchEngine, SearchOptions } from './semantic-search';
import { initializeDatabase } from './database';

export interface SemanticWitness {
  tref: string;
  text: string;
  hebrew?: string;
  similarity: number;
  searchType: 'vector' | 'fulltext' | 'hybrid';
  workTitle: string;
  authorName: string;
}

export interface SemanticRAGResult {
  question: string;
  witnesses: SemanticWitness[];
  guesses: string[]; // For compatibility with existing system
  searchMetadata: {
    totalResults: number;
    searchTime: number;
    searchType: 'semantic';
    averageSimilarity: number;
  };
}

/**
 * Modern semantic RAG system using vector embeddings
 */
export class SemanticRAG {
  private searchEngine: SemanticSearchEngine;
  
  constructor() {
    this.searchEngine = new SemanticSearchEngine();
    // Initialize database connection
    initializeDatabase();
  }

  /**
   * Main semantic search function - drop-in replacement for bootstrapRAG
   */
  async search(
    question: string, 
    options: SearchOptions = {}
  ): Promise<SemanticRAGResult> {
    if (!question || question.trim().length === 0) {
      throw new Error('Question cannot be empty');
    }

    const startTime = Date.now();
    const normalizedQuestion = question.trim();

    // Default search options optimized for RAG
    const searchOptions: SearchOptions = {
      limit: 10, // Get more results for better context
      minSimilarity: 0.1, // Very low threshold to include diverse results
      useHybridSearch: true, // Always use hybrid for best results
      includeEnglish: true,
      includeHebrew: options.includeHebrew || false,
      ...options
    };

    try {
      // Perform hybrid semantic search
      const searchResult = await this.searchEngine.search(normalizedQuestion, searchOptions);
      
      // Convert search results to witness format
      const witnesses: SemanticWitness[] = searchResult.results.map(result => ({
        tref: result.tref,
        text: result.contentEnglish || '',
        hebrew: result.contentHebrew,
        similarity: result.similarity,
        searchType: result.searchType,
        workTitle: result.workTitle,
        authorName: result.authorName
      }));

      // For compatibility, create "guesses" array from search results
      const guesses = witnesses.map(w => w.tref);

      // Calculate search metadata
      const searchTime = Date.now() - startTime;
      const averageSimilarity = witnesses.length > 0 
        ? witnesses.reduce((sum, w) => sum + w.similarity, 0) / witnesses.length
        : 0;

      return {
        question: normalizedQuestion,
        witnesses,
        guesses,
        searchMetadata: {
          totalResults: witnesses.length,
          searchTime,
          searchType: 'semantic',
          averageSimilarity
        }
      };

    } catch (error) {
      console.error('Semantic RAG search error:', error);
      throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enhanced search with query expansion and filtering
   */
  async advancedSearch(
    question: string,
    options: SearchOptions & {
      expandQuery?: boolean;
      filterByWork?: string[];
      filterByAuthor?: string[];
      minSimilarity?: number;
    } = {}
  ): Promise<SemanticRAGResult> {
    // TODO: Implement query expansion using LLM
    // For now, use the basic search
    return this.search(question, options);
  }

  /**
   * Get search suggestions based on available content
   */
  async getSearchSuggestions(partialQuery: string): Promise<string[]> {
    // TODO: Implement search suggestions
    // For now, return empty array
    return [];
  }

  /**
   * Analyze search quality and provide insights
   */
  async analyzeSearchQuality(question: string, witnesses: SemanticWitness[]): Promise<{
    averageSimilarity: number;
    confidenceScore: number;
    recommendations: string[];
  }> {
    const averageSimilarity = witnesses.length > 0 
      ? witnesses.reduce((sum, w) => sum + w.similarity, 0) / witnesses.length
      : 0;

    const confidenceScore = Math.min(averageSimilarity * 2, 1.0); // Scale to 0-1

    const recommendations: string[] = [];
    
    if (averageSimilarity < 0.3) {
      recommendations.push('Consider rephrasing your question or using different keywords');
    }
    
    if (witnesses.length < 3) {
      recommendations.push('Try a broader search or check if more texts are available');
    }

    return {
      averageSimilarity,
      confidenceScore,
      recommendations
    };
  }
}

/**
 * Drop-in replacement for the existing bootstrapRAG function
 * Maintains API compatibility while using semantic search
 */
export async function bootstrapSemanticRAG(question: string): Promise<{
  question: string;
  witnesses: Array<{ tref: string; text: string; hebrew?: string }>;
  guesses: string[];
}> {
  const semanticRAG = new SemanticRAG();
  const result = await semanticRAG.search(question);

  // Convert to legacy format for compatibility
  return {
    question: result.question,
    witnesses: result.witnesses.map(w => ({
      tref: w.tref,
      text: w.text,
      hebrew: w.hebrew
    })),
    guesses: result.guesses
  };
}

/**
 * Hybrid approach: Try semantic search first, fallback to legacy if needed
 */
export async function hybridBootstrapRAG(
  question: string,
  legacyBootstrapRAG: (question: string) => Promise<{question: string; witnesses: Array<{tref: string; text: string; hebrew?: string}>; guesses: string[]}>
): Promise<{
  question: string;
  witnesses: Array<{ tref: string; text: string; hebrew?: string }>;
  guesses: string[];
  searchMethod: 'semantic' | 'legacy' | 'hybrid';
}> {
  try {
    // Try semantic search first
    const semanticResult = await bootstrapSemanticRAG(question);
    
    // If we get good results (at least 2 witnesses with decent similarity), use semantic
    if (semanticResult.witnesses.length >= 2) {
      return {
        ...semanticResult,
        searchMethod: 'semantic'
      };
    }
    
    // If semantic search returns few results, try legacy as fallback
    console.log('Semantic search returned few results, trying legacy fallback...');
    const legacyResult = await legacyBootstrapRAG(question);
    
    // Combine results if both have content
    if (semanticResult.witnesses.length > 0 && legacyResult.witnesses.length > 0) {
      // Merge and deduplicate
      const combinedWitnesses = [...semanticResult.witnesses];
      const existingRefs = new Set(semanticResult.witnesses.map(w => w.tref));
      
      legacyResult.witnesses.forEach((witness: {tref: string; text: string; hebrew?: string}) => {
        if (!existingRefs.has(witness.tref)) {
          combinedWitnesses.push(witness);
        }
      });
      
      return {
        question,
        witnesses: combinedWitnesses,
        guesses: [...semanticResult.guesses, ...legacyResult.guesses],
        searchMethod: 'hybrid'
      };
    }
    
    // Use whichever has more results
    if (legacyResult.witnesses.length > semanticResult.witnesses.length) {
      return {
        ...legacyResult,
        searchMethod: 'legacy'
      };
    }
    
    return {
      ...semanticResult,
      searchMethod: 'semantic'
    };
    
  } catch (error) {
    console.error('Hybrid RAG failed, falling back to legacy:', error);
    
    // Final fallback to legacy system
    const legacyResult = await legacyBootstrapRAG(question);
    return {
      ...legacyResult,
      searchMethod: 'legacy'
    };
  }
}

// Export singleton instance for convenience
export const semanticRAG = new SemanticRAG();