# Scalable Text Search Implementation Plan

## Overview
Migrate from manual JSON index to AI-powered semantic search supporting thousands of texts with any topic queries.

## Architecture Summary
- **Database**: PostgreSQL + pgvector for hybrid vector/full-text search
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Search**: Semantic similarity + keyword matching + query expansion
- **Pipeline**: Automated text chunking, embedding, and indexing

## Phase 1: Foundation Setup (Week 1-2)
### 1.1 Database Setup
- [ ] Install PostgreSQL with pgvector extension
- [ ] Run `schema.sql` to create tables and indexes
- [ ] Set up connection pooling and environment config
- [ ] Create database migration scripts

### 1.2 Core Infrastructure
- [ ] Implement `preprocessing.ts` pipeline classes
- [ ] Create database connection module with Prisma/pg
- [ ] Add OpenAI API integration for embeddings
- [ ] Set up error handling and logging

### 1.3 Basic Search Engine
```typescript
// lib/semantic-search.ts
class SemanticSearchEngine {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]>
  async hybridSearch(query: string): Promise<SearchResult[]>
  async rerank(results: SearchResult[], query: string): Promise<SearchResult[]>
}
```

## Phase 2: Data Migration (Week 2-3)
### 2.1 Ramchal Content Processing
- [ ] Process existing Ramchal works (Mesillat Yesharim, Derekh Hashem, Da'at Tevunot)
- [ ] Chunk texts into semantic units (~500-800 characters)
- [ ] Generate embeddings for all chunks
- [ ] Store in database with proper metadata

### 2.2 Search Integration
- [ ] Update RAG system to use semantic search instead of JSON index
- [ ] Implement fallback to current system during transition
- [ ] A/B test search quality between old and new systems

```typescript
// Migration strategy
class HybridRAGSystem {
  async bootstrapRAG(question: string): Promise<RAGBootstrapResult> {
    // Try semantic search first
    const semanticResults = await this.semanticSearch(question);
    
    // Fallback to JSON index if needed
    if (semanticResults.length < 3) {
      const jsonResults = await this.legacyJsonSearch(question);
      return this.combineResults(semanticResults, jsonResults);
    }
    
    return { witnesses: semanticResults, ... };
  }
}
```

## Phase 3: Query Enhancement (Week 3-4)
### 3.1 Intelligent Query Processing
- [ ] Query expansion using LLM
- [ ] Multi-language query support (Hebrew + English)
- [ ] Query type detection (factual, conceptual, comparative)

```typescript
class QueryProcessor {
  async expandQuery(query: string): Promise<string[]> {
    // Use LLM to generate related terms
    // "evil" -> ["suffering", "theodicy", "yetzer hara", "sin"]
  }
  
  async detectLanguage(query: string): Promise<'hebrew' | 'english' | 'mixed'>
  async generateSearchStrategies(query: string): Promise<SearchStrategy[]>
}
```

### 3.2 Advanced Search Features
- [ ] Semantic similarity threshold tuning
- [ ] Author/work filtering
- [ ] Time period/historical context filtering
- [ ] Concept clustering and related topics

## Phase 4: Scale and Optimize (Week 4-5)
### 4.1 Performance Optimization
- [ ] Implement search result caching
- [ ] Add search analytics and query logging
- [ ] Optimize vector indexes (HNSW parameters)
- [ ] Add connection pooling and query optimization

### 4.2 Batch Processing System
```typescript
// For processing thousands of texts
class BatchProcessor {
  async processBulkTexts(sources: TextSource[]): Promise<void> {
    for (const batch of this.createBatches(sources, 100)) {
      await this.processTextBatch(batch);
      await this.rateLimitDelay();
    }
  }
}
```

## Phase 5: Production Deployment (Week 5-6)
### 5.1 Monitoring and Analytics
- [ ] Search quality metrics (precision, recall)
- [ ] User interaction tracking
- [ ] Performance monitoring (query latency, cache hit rates)
- [ ] Cost monitoring (OpenAI API usage)

### 5.2 Content Management
- [ ] Admin interface for adding new texts
- [ ] Automated reprocessing on content updates
- [ ] Version control for embeddings
- [ ] Data backup and recovery

## API Changes Required

### Current API (to be deprecated)
```typescript
// lib/rag.ts - current JSON-based system
export async function bootstrapRAG(question: string): Promise<RAGBootstrapResult>
```

### New API
```typescript
// lib/semantic-rag.ts - new vector-based system
export class SemanticRAG {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  async getRelevantChunks(query: string, limit: number): Promise<TextChunk[]>
  async explainResults(query: string, results: SearchResult[]): Promise<string>
}
```

## Migration Strategy: Zero-Downtime Deployment

### Phase A: Parallel Systems (Week 2-3)
- Keep existing JSON system running
- Build semantic search in parallel
- A/B test with subset of queries

### Phase B: Gradual Migration (Week 4)
- Route 10% of queries to semantic search
- Monitor quality and performance
- Gradually increase to 50%, then 100%

### Phase C: Legacy Cleanup (Week 5)
- Remove JSON index dependencies
- Clean up old RAG code
- Update documentation

## Database Migration Script
```sql
-- migrate_to_semantic.sql
BEGIN;

-- Add new columns to existing tables if needed
ALTER TABLE existing_table ADD COLUMN embedding vector(1536);

-- Migrate existing data
INSERT INTO text_chunks (work_id, tref, content_english, ...)
SELECT id, reference, text_content, ...
FROM legacy_texts;

-- Create indexes after data insertion for better performance
CREATE INDEX CONCURRENTLY idx_new_embeddings ON text_chunks 
  USING hnsw (embedding vector_cosine_ops);

COMMIT;
```

## Cost Estimation

### One-Time Setup Costs
- **Embedding Generation**: ~$50-200 for initial Ramchal corpus
- **Database Setup**: PostgreSQL hosting ~$20-50/month

### Ongoing Costs (per 1000 texts)
- **Storage**: ~1GB embeddings + metadata = $5-10/month
- **Queries**: ~$10-30/month depending on usage
- **Compute**: Database queries negligible

### Scaling Economics
- **10,000 texts**: ~$100-200/month total
- **100,000 texts**: ~$500-1000/month total

## Success Metrics

### Technical Metrics
- **Query Latency**: < 500ms for semantic search
- **Recall**: > 90% for relevant passages
- **Precision**: > 80% for top-5 results

### User Experience Metrics  
- **Coverage**: Answer rate > 95% (vs current ~70%)
- **Quality**: Reduced "no relevant passages found" errors
- **Flexibility**: Support any topic without manual indexing

## Risk Mitigation

### Technical Risks
- **Embedding Quality**: Test with domain-specific fine-tuning if needed
- **Performance**: Implement aggressive caching and optimization
- **Cost Overruns**: Set API usage limits and monitoring

### Business Risks
- **Migration Complexity**: Phased rollout with rollback capability
- **User Disruption**: Maintain current functionality during transition
- **Data Loss**: Comprehensive backup strategy

## Next Steps
1. **Get approval** for architecture and timeline
2. **Set up development environment** with PostgreSQL + pgvector
3. **Start Phase 1** with foundation setup
4. **Begin Ramchal content migration** in parallel with development

This system will scale from 3 Ramchal works to thousands of texts with zero additional manual indexing required.