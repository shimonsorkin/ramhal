/**
 * Text preprocessing pipeline for scalable semantic search
 * Handles chunking, embedding, and indexing of texts
 */

import OpenAI from 'openai';
import { getTextV3 } from './sefaria';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TextChunk {
  workId: number;
  partNumber?: number;
  chapterNumber?: number;
  sectionNumber?: number;
  paragraphNumber?: number;
  tref: string;
  canonicalRef: string;
  contentHebrew?: string;
  contentEnglish?: string;
  chunkType: 'paragraph' | 'section' | 'chapter' | 'footnote';
  wordCount: number;
  characterCount: number;
  embeddingHebrew?: number[];
  embeddingEnglish?: number[];
  topicKeywords: string[];
  complexityScore: number;
}

export interface ProcessingOptions {
  chunkSize: 'paragraph' | 'section' | 'chapter';
  includeHebrew: boolean;
  includeEnglish: boolean;
  generateKeywords: boolean;
  maxChunkLength: number; // Max characters per chunk
  overlapSize: number; // Characters to overlap between chunks
}

/**
 * Smart text chunking that preserves semantic boundaries
 */
export class TextChunker {
  private options: ProcessingOptions;

  constructor(options: ProcessingOptions) {
    this.options = options;
  }

  /**
   * Chunk text into semantically meaningful units
   */
  public chunkText(text: string, language: 'hebrew' | 'english'): string[] {
    if (!text || text.trim().length === 0) return [];

    // Clean and normalize text
    const cleanText = this.normalizeText(text, language);
    
    // Split by natural boundaries
    const chunks = this.splitByBoundaries(cleanText, language);
    
    // Handle oversized chunks
    return this.handleOversizedChunks(chunks);
  }

  private normalizeText(text: string, language: 'hebrew' | 'english'): string {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();
  }

  private splitByBoundaries(text: string, language: 'hebrew' | 'english'): string[] {
    const chunks: string[] = [];
    
    // Primary split by paragraphs (double newlines)
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
      if (paragraph.trim().length === 0) continue;
      
      if (paragraph.length <= this.options.maxChunkLength) {
        chunks.push(paragraph.trim());
      } else {
        // Split long paragraphs by sentences
        const sentences = this.splitBySentences(paragraph, language);
        let currentChunk = '';
        
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > this.options.maxChunkLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = sentence;
            } else {
              // Single sentence too long - force split
              chunks.push(sentence.trim());
            }
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          }
        }
        
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
      }
    }
    
    return chunks;
  }

  private splitBySentences(text: string, language: 'hebrew' | 'english'): string[] {
    if (language === 'hebrew') {
      // Hebrew sentence boundaries
      return text.split(/[.!?׃։]/g).filter(s => s.trim().length > 0);
    } else {
      // English sentence boundaries
      return text.split(/[.!?]+\s+/g).filter(s => s.trim().length > 0);
    }
  }

  private handleOversizedChunks(chunks: string[]): string[] {
    const result: string[] = [];
    
    for (const chunk of chunks) {
      if (chunk.length <= this.options.maxChunkLength) {
        result.push(chunk);
      } else {
        // Force split by character count with overlap
        let start = 0;
        while (start < chunk.length) {
          const end = Math.min(start + this.options.maxChunkLength, chunk.length);
          const subChunk = chunk.substring(start, end);
          result.push(subChunk);
          start = end - this.options.overlapSize;
        }
      }
    }
    
    return result;
  }
}

/**
 * Generate embeddings for text chunks
 */
export class EmbeddingGenerator {
  private batchSize = 10; // Process embeddings in batches
  private rateLimitDelay = 100; // ms between requests

  /**
   * Generate embeddings for a batch of texts
   */
  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small', // 1536 dimensions, cost-effective
        input: texts,
        encoding_format: 'float',
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process large batches with rate limiting
   */
  public async generateEmbeddingsBatched(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      
      try {
        const embeddings = await this.generateEmbeddings(batch);
        results.push(...embeddings);
        
        // Rate limiting
        if (i + this.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }
      } catch (error) {
        console.error(`Failed to process batch ${i}-${i + batch.length}:`, error);
        // Add empty embeddings for failed batch
        results.push(...new Array(batch.length).fill([]));
      }
    }
    
    return results;
  }
}

/**
 * Extract topic keywords from text using NLP
 */
export class KeywordExtractor {
  /**
   * Extract keywords using simple frequency analysis
   * In production, could use more sophisticated NLP libraries
   */
  public extractKeywords(text: string, language: 'hebrew' | 'english'): string[] {
    if (!text) return [];

    // Remove common stop words
    const stopWords = language === 'hebrew' 
      ? ['של', 'על', 'את', 'עם', 'אל', 'בו', 'לא', 'זה', 'הוא', 'היא', 'הם', 'הן']
      : ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'];

    // Extract words, filter stop words, count frequency
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // Return top keywords by frequency
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Calculate text complexity score (0-1, higher = more complex)
   */
  public calculateComplexity(text: string): number {
    if (!text) return 0;

    const words = text.split(/\s+/);
    const sentences = text.split(/[.!?]+/).length;
    
    // Simple complexity metrics
    const avgWordsPerSentence = words.length / Math.max(sentences, 1);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    // Normalize to 0-1 scale
    const complexityScore = Math.min(
      (avgWordsPerSentence / 20) * 0.6 + (avgWordLength / 8) * 0.4,
      1
    );
    
    return complexityScore;
  }
}

/**
 * Main text processing pipeline
 */
export class TextProcessor {
  private chunker: TextChunker;
  private embeddingGenerator: EmbeddingGenerator;
  private keywordExtractor: KeywordExtractor;

  constructor(options: ProcessingOptions) {
    this.chunker = new TextChunker(options);
    this.embeddingGenerator = new EmbeddingGenerator();
    this.keywordExtractor = new KeywordExtractor();
  }

  /**
   * Process a complete work into searchable chunks
   */
  public async processWork(
    workId: number,
    tref: string,
    options: ProcessingOptions
  ): Promise<TextChunk[]> {
    try {
      // Fetch text from Sefaria
      const result = await getTextV3(tref, { lang: 'bi' });
      
      const chunks: TextChunk[] = [];
      let chunkIndex = 0;

      // Process English content
      if (options.includeEnglish && result.text) {
        const englishChunks = this.chunker.chunkText(result.text, 'english');
        const englishEmbeddings = await this.embeddingGenerator.generateEmbeddingsBatched(englishChunks);
        
        for (let i = 0; i < englishChunks.length; i++) {
          const content = englishChunks[i];
          const chunk: TextChunk = {
            workId,
            tref: `${tref}:${chunkIndex + 1}`,
            canonicalRef: `${tref}:${chunkIndex + 1}`,
            contentEnglish: content,
            chunkType: options.chunkSize,
            wordCount: content.split(/\s+/).length,
            characterCount: content.length,
            embeddingEnglish: englishEmbeddings[i] || [],
            topicKeywords: options.generateKeywords 
              ? this.keywordExtractor.extractKeywords(content, 'english')
              : [],
            complexityScore: this.keywordExtractor.calculateComplexity(content),
            paragraphNumber: chunkIndex + 1
          };
          
          chunks.push(chunk);
          chunkIndex++;
        }
      }

      // Process Hebrew content similarly
      if (options.includeHebrew && result.he) {
        const hebrewChunks = this.chunker.chunkText(result.he, 'hebrew');
        const hebrewEmbeddings = await this.embeddingGenerator.generateEmbeddingsBatched(hebrewChunks);
        
        // Merge with existing English chunks or create new ones
        // Implementation depends on whether you want bilingual chunks or separate chunks
      }

      return chunks;
    } catch (error) {
      console.error(`Error processing work ${tref}:`, error);
      throw error;
    }
  }
}

/**
 * Database operations for storing processed chunks
 */
export class ChunkDatabase {
  // This would integrate with your PostgreSQL database
  // Implementation depends on your database library (pg, Prisma, etc.)
  
  public async saveChunks(chunks: TextChunk[]): Promise<void> {
    // Bulk insert chunks into database
    // Update embeddings and search vectors
    // Handle conflicts/updates
  }
  
  public async deleteWorkChunks(workId: number): Promise<void> {
    // Remove all chunks for a work (for reprocessing)
  }
}