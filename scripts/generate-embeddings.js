/**
 * Generate embeddings for existing text chunks
 * This script will process all chunks that don't have embeddings yet
 */

const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config({ path: '.env.local' });

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
  console.error('❌ Please add your OpenAI API key to .env.local');
  console.log('💡 Get your API key from: https://platform.openai.com/api-keys');
  console.log('💡 Then update OPENAI_API_KEY in .env.local');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

/**
 * Generate embeddings for a batch of texts
 */
async function generateEmbeddings(texts) {
  if (texts.length === 0) return [];

  try {
    console.log(`🤖 Generating embeddings for ${texts.length} text(s)...`);
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // 1536 dimensions, cost-effective
      input: texts,
      encoding_format: 'float',
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('❌ Error generating embeddings:', error.message);
    if (error.status === 401) {
      console.log('💡 Check your OpenAI API key - it might be invalid or expired');
    } else if (error.status === 429) {
      console.log('💡 Rate limit exceeded - waiting before retry...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
      return generateEmbeddings(texts); // Retry
    }
    throw error;
  }
}

/**
 * Update chunks with embeddings in the database
 */
async function updateChunkEmbeddings(chunkId, embedding) {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE text_chunks SET embedding_english = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(embedding), chunkId]
    );
  } finally {
    client.release();
  }
}

/**
 * Main function to process all chunks without embeddings
 */
async function processAllChunks() {
  console.log('🚀 Starting embedding generation for existing chunks\n');
  
  const client = await pool.connect();
  
  try {
    // Get all chunks that don't have embeddings yet
    const chunksResult = await client.query(`
      SELECT tc.id, tc.content_english, tc.tref, w.title as work_title
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      WHERE tc.content_english IS NOT NULL 
        AND tc.embedding_english IS NULL
      ORDER BY tc.id
    `);
    
    const chunks = chunksResult.rows;
    console.log(`📊 Found ${chunks.length} chunks without embeddings`);
    
    if (chunks.length === 0) {
      console.log('✅ All chunks already have embeddings!');
      return;
    }
    
    // Show what we'll process
    console.log('\n📋 Chunks to process:');
    chunks.forEach((chunk, i) => {
      console.log(`${i + 1}. ${chunk.work_title} - ${chunk.tref}`);
      console.log(`   Content: ${chunk.content_english.substring(0, 100)}...`);
    });
    
    console.log('\n⚡ Processing embeddings...');
    
    // Process in batches of 10 (OpenAI batch limit)
    const batchSize = 10;
    let processed = 0;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(chunk => chunk.content_english);
      
      console.log(`\n🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
      
      try {
        // Generate embeddings for this batch
        const embeddings = await generateEmbeddings(texts);
        
        // Update database for each chunk in the batch
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          
          if (embedding && embedding.length === 1536) {
            await updateChunkEmbeddings(chunk.id, embedding);
            processed++;
            console.log(`✅ Updated chunk ${chunk.id}: ${chunk.tref}`);
          } else {
            console.log(`⚠️ Invalid embedding for chunk ${chunk.id}: ${chunk.tref}`);
          }
        }
        
        // Rate limiting - wait a bit between batches
        if (i + batchSize < chunks.length) {
          console.log('⏱️ Waiting 1 second before next batch...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Failed to process batch starting at index ${i}:`, error.message);
        // Continue with next batch
      }
    }
    
    console.log(`\n🎉 Embedding generation complete!`);
    console.log(`📊 Successfully processed ${processed}/${chunks.length} chunks`);
    
    // Verify results
    console.log('\n🔍 Verifying results...');
    const verifyResult = await client.query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(embedding_english) as chunks_with_embeddings,
        COUNT(*) - COUNT(embedding_english) as chunks_without_embeddings
      FROM text_chunks 
      WHERE content_english IS NOT NULL
    `);
    
    const stats = verifyResult.rows[0];
    console.log(`📈 Total chunks: ${stats.total_chunks}`);
    console.log(`✅ With embeddings: ${stats.chunks_with_embeddings}`);
    console.log(`❌ Without embeddings: ${stats.chunks_without_embeddings}`);
    
    if (stats.chunks_without_embeddings === '0') {
      console.log('\n🎯 All chunks now have embeddings! Ready for semantic search.');
      console.log('\n🚀 Next steps:');
      console.log('1. Test semantic search: npm run test-semantic-search');
      console.log('2. Try queries like "What does Ramhal say about evil?"');
      console.log('3. Compare results with the old system');
    }
    
  } finally {
    client.release();
  }
}

/**
 * Test embedding generation with a single text
 */
async function testEmbeddingGeneration() {
  console.log('🧪 Testing embedding generation...\n');
  
  const testText = "What is the nature of evil according to divine wisdom?";
  
  try {
    const embeddings = await generateEmbeddings([testText]);
    const embedding = embeddings[0];
    
    console.log(`✅ Test successful!`);
    console.log(`📊 Generated embedding with ${embedding.length} dimensions`);
    console.log(`🎯 Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]`);
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Test the embedding generation first
    console.log('🔧 Testing OpenAI connection...');
    const testPassed = await testEmbeddingGeneration();
    
    if (!testPassed) {
      console.log('\n💥 Embedding test failed. Please check your OpenAI API key and try again.');
      process.exit(1);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Process all chunks
    await processAllChunks();
    
  } catch (error) {
    console.error('\n💥 Script failed:', error.message);
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

// Run the script
if (require.main === module) {
  main();
}

module.exports = { generateEmbeddings, processAllChunks, testEmbeddingGeneration };