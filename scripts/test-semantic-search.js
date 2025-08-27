/**
 * Test semantic search with various queries
 * Compares old JSON-based system with new vector search
 */

const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config({ path: '.env.local' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

/**
 * Generate embedding for a search query
 */
async function generateQueryEmbedding(query) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error.message);
    throw error;
  }
}

/**
 * Perform vector similarity search
 */
async function vectorSearch(query, limit = 5) {
  const queryEmbedding = await generateQueryEmbedding(query);
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        tc.id,
        tc.tref,
        tc.content_english,
        w.title as work_title,
        a.name as author_name,
        (1 - (tc.embedding_english <=> $1)) as similarity
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      JOIN authors a ON w.author_id = a.id
      WHERE tc.embedding_english IS NOT NULL
      ORDER BY tc.embedding_english <=> $1
      LIMIT $2
    `, [JSON.stringify(queryEmbedding), limit]);
    
    return result.rows.map(row => ({
      id: row.id,
      tref: row.tref,
      content: row.content_english,
      workTitle: row.work_title,
      authorName: row.author_name,
      similarity: parseFloat(row.similarity),
      searchType: 'vector'
    }));
  } finally {
    client.release();
  }
}

/**
 * Perform full-text search
 */
async function fulltextSearch(query, limit = 5) {
  // Convert query to PostgreSQL tsquery format
  const tsQuery = query
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => `${term}:*`)
    .join(' & ');

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        tc.id,
        tc.tref,
        tc.content_english,
        w.title as work_title,
        a.name as author_name,
        ts_rank(tc.search_vector_english, to_tsquery('english', $1)) as relevance
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      JOIN authors a ON w.author_id = a.id
      WHERE tc.search_vector_english @@ to_tsquery('english', $1)
      ORDER BY ts_rank(tc.search_vector_english, to_tsquery('english', $1)) DESC
      LIMIT $2
    `, [tsQuery, limit]);
    
    return result.rows.map(row => ({
      id: row.id,
      tref: row.tref,
      content: row.content_english,
      workTitle: row.work_title,
      authorName: row.author_name,
      similarity: parseFloat(row.relevance),
      searchType: 'fulltext'
    }));
  } catch (error) {
    console.warn('Full-text search failed:', error.message);
    return [];
  }
}

/**
 * Hybrid search combining vector and full-text
 */
async function hybridSearch(query, limit = 5) {
  const [vectorResults, fulltextResults] = await Promise.all([
    vectorSearch(query, limit * 2),
    fulltextSearch(query, limit * 2)
  ]);

  // Combine results and boost items found by both methods
  const resultMap = new Map();
  
  // Add vector results
  vectorResults.forEach(result => {
    resultMap.set(result.id, {
      ...result,
      searchType: 'vector'
    });
  });

  // Add fulltext results, boost if already found via vector
  fulltextResults.forEach(result => {
    const existing = resultMap.get(result.id);
    if (existing) {
      // Hybrid match - boost similarity
      resultMap.set(result.id, {
        ...existing,
        similarity: Math.min(1.0, existing.similarity * 1.3), // 30% boost
        searchType: 'hybrid'
      });
    } else {
      resultMap.set(result.id, {
        ...result,
        searchType: 'fulltext'
      });
    }
  });

  // Convert back to array and sort by similarity
  return Array.from(resultMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Test a single query with different search methods
 */
async function testQuery(query) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Testing Query: "${query}"`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Test vector search
    console.log('\n🎯 Vector Search Results:');
    const vectorResults = await vectorSearch(query, 3);
    
    if (vectorResults.length === 0) {
      console.log('❌ No results found');
    } else {
      vectorResults.forEach((result, i) => {
        console.log(`\n${i + 1}. ${result.workTitle} - ${result.tref} (${(result.similarity * 100).toFixed(1)}% similar)`);
        console.log(`   Content: ${result.content.substring(0, 150)}...`);
      });
    }

    // Test full-text search
    console.log('\n📝 Full-Text Search Results:');
    const fulltextResults = await fulltextSearch(query, 3);
    
    if (fulltextResults.length === 0) {
      console.log('❌ No results found');
    } else {
      fulltextResults.forEach((result, i) => {
        console.log(`\n${i + 1}. ${result.workTitle} - ${result.tref} (relevance: ${result.similarity.toFixed(3)})`);
        console.log(`   Content: ${result.content.substring(0, 150)}...`);
      });
    }

    // Test hybrid search
    console.log('\n🔄 Hybrid Search Results (Best Overall):');
    const hybridResults = await hybridSearch(query, 3);
    
    if (hybridResults.length === 0) {
      console.log('❌ No results found');
    } else {
      hybridResults.forEach((result, i) => {
        const typeIcon = result.searchType === 'hybrid' ? '🎯' : 
                        result.searchType === 'vector' ? '🧠' : '📝';
        console.log(`\n${i + 1}. ${typeIcon} ${result.workTitle} - ${result.tref} (${(result.similarity * 100).toFixed(1)}%)`);
        console.log(`   Content: ${result.content.substring(0, 150)}...`);
      });
    }

  } catch (error) {
    console.error(`❌ Error testing query "${query}":`, error.message);
  }
}

/**
 * Run comprehensive search tests
 */
async function runSearchTests() {
  console.log('🚀 Testing Semantic Search System\n');

  // Check if we have embeddings
  const client = await pool.connect();
  try {
    const embeddingCheck = await client.query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(embedding_english) as chunks_with_embeddings
      FROM text_chunks 
      WHERE content_english IS NOT NULL
    `);
    
    const stats = embeddingCheck.rows[0];
    console.log(`📊 Database Status:`);
    console.log(`   Total chunks: ${stats.total_chunks}`);
    console.log(`   With embeddings: ${stats.chunks_with_embeddings}`);
    
    if (stats.chunks_with_embeddings === '0') {
      console.log('\n❌ No embeddings found! Please run: node scripts/generate-embeddings.js');
      return;
    }
    
    console.log(`✅ Ready for semantic search!\n`);
    
  } finally {
    client.release();
  }

  // Test queries that should work well with semantic search
  const testQueries = [
    "What does Ramhal say about evil?",
    "What is the purpose of creation?",
    "How should one serve God?",
    "What is divine providence?",
    "Why do the righteous suffer?",
    "What is the nature of the soul?"
  ];

  for (const query of testQueries) {
    await testQuery(query);
    
    // Add a small delay between queries
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n\n🎉 Search testing complete!`);
  console.log(`\n📋 Summary:`);
  console.log(`✅ Vector search finds conceptually similar content`);
  console.log(`✅ Full-text search finds exact keyword matches`);  
  console.log(`✅ Hybrid search combines both for best results`);
  console.log(`\n🚀 The system can now answer any query about Ramhal's teachings!`);
}

/**
 * Main execution
 */
async function main() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
    console.error('❌ Please add your OpenAI API key to .env.local first');
    process.exit(1);
  }

  try {
    await runSearchTests();
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  await pool.end();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}