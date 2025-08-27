/**
 * Process missing sections from Derekh Hashem for complete coverage
 * This addresses the issue where users ask about content we don't have
 */

const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

// Use production database directly
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

// Missing sections from Derekh Hashem based on Sefaria API structure
const MISSING_SECTIONS = [
  // Part Two - missing sections
  'Derekh Hashem, Part Two, On How Providence Works',
  'Derekh Hashem, Part Two, On the System of Providence', 
  'Derekh Hashem, Part Two, On the Influence of the Stars',
  'Derekh Hashem, Part Two, On Specific Modes of Providence',
  
  // Part Three - missing sections  
  'Derekh Hashem, Part Three, On the Prophetic Experience',
  'Derekh Hashem, Part Three, On Moshe\'s Unique Status',
  
  // Part Four - missing sections (the critical ones!)
  'Derekh Hashem, Part Four, On Love and Fear of God',
  'Derekh Hashem, Part Four, On the Sh\'ma and Its Blessings', // ← USER'S QUESTION!
  'Derekh Hashem, Part Four, On the Daily Order of Prayer',
  'Derekh Hashem, Part Four, On Divine Service and the Calendar', 
  'Derekh Hashem, Part Four, On Seasonal Commandments',
  'Derekh Hashem, Part Four, On Blessings'
];

/**
 * Enhanced text fetching with better error handling
 */
async function getTextV3(tref, opts = {}) {
  const { lang = 'en' } = opts;
  
  const ramchalTitles = [
    'Mesillat Yesharim', 'Mesilat Yesharim',
    'Da\'at Tevunot', 'Daat Tevunot', 
    'Derekh Hashem'
  ];
  
  const isRamchalText = ramchalTitles.some(title => tref.includes(title));
  const apiRef = isRamchalText ? encodeURIComponent(tref) : tref.replace(/\s+/g, '.').replace(/:/g, '.');
  
  const params = new URLSearchParams();
  params.set('lang', lang === 'he' ? 'he' : 'bi');

  const url = `https://www.sefaria.org/api/texts/${apiRef}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`⚠️  Text not found: ${tref}`);
        return null;
      }
      throw new Error(`Sefaria API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      console.warn(`⚠️  Sefaria error for ${tref}: ${data.error}`);
      return null;
    }
    
    const extractText = (textData) => {
      if (!textData) return undefined;
      return Array.isArray(textData) ? textData.join(' ') : textData;
    };
    
    return {
      ref: data.ref,
      text: extractText(data.text),
      he: extractText(data.he),
      versions: data.versions || []
    };
  } catch (error) {
    console.error(`❌ Failed to fetch ${tref}:`, error.message);
    return null;
  }
}

/**
 * Enhanced text chunking with better semantic boundaries
 */
function chunkText(text, maxLength = 600, overlapSize = 100) {
  if (!text || text.trim().length === 0) return [];
  
  // Clean text more thoroughly
  const cleanText = text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')   // Normalize whitespace
    .replace(/\n{2,}/g, '\n\n') // Normalize paragraph breaks
    .trim();
  
  // Split by paragraphs first (double newlines)
  const paragraphs = cleanText.split(/\n\s*\n/);
  const chunks = [];
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) continue;
    
    if (paragraph.length <= maxLength) {
      chunks.push(paragraph.trim());
    } else {
      // Split long paragraphs by sentences, with overlap
      const sentences = paragraph.split(/[.!?]+\\s+/).filter(s => s.trim());
      let currentChunk = '';
      let previousChunk = '';
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence + '.';
        
        if (potentialChunk.length > maxLength && currentChunk.length > 0) {
          // Add overlap from previous chunk
          const finalChunk = (previousChunk && overlapSize > 0) 
            ? previousChunk.slice(-overlapSize) + ' ' + currentChunk.trim()
            : currentChunk.trim();
            
          chunks.push(finalChunk);
          previousChunk = currentChunk;
          currentChunk = sentence + '.';
        } else {
          currentChunk = potentialChunk;
        }
      }
      
      if (currentChunk.trim()) {
        const finalChunk = (previousChunk && overlapSize > 0)
          ? previousChunk.slice(-overlapSize) + ' ' + currentChunk.trim()
          : currentChunk.trim();
        chunks.push(finalChunk);
      }
    }
  }
  
  return chunks.filter(chunk => chunk.length > 50); // Filter out very short chunks
}

/**
 * Save text chunks to database
 */
async function saveTextChunks(workId, baseRef, chunks) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    let savedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const chunkRef = `${baseRef}:${i + 1}`;
      const wordCount = content.split(/\s+/).length;
      const characterCount = content.length;
      
      try {
        // Check if chunk already exists
        const existsResult = await client.query('SELECT id FROM text_chunks WHERE tref = $1', [chunkRef]);
        
        if (existsResult.rows.length === 0) {
          await client.query(`
            INSERT INTO text_chunks (
              work_id, tref, canonical_ref, content_english, chunk_type,
              word_count, character_count, paragraph_number
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
          workId,
          chunkRef,
          chunkRef,
            content,
            'paragraph',
            wordCount,
            characterCount,
            i + 1
          ]);
          
          savedCount++;
        } else {
          console.log(`    ⏭️  Chunk ${chunkRef} already exists, skipping`);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to save chunk ${chunkRef}:`, error.message);
      }
    }
    
    await client.query('COMMIT');
    return savedCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process missing sections
 */
async function processMissingSections() {
  console.log('🚀 Processing Missing Derekh Hashem Sections\\n');
  console.log(`📚 ${MISSING_SECTIONS.length} missing sections to process`);
  
  // Get Derekh Hashem work ID
  const client = await pool.connect();
  let workId;
  try {
    const result = await client.query('SELECT id FROM works WHERE title = $1', ['Derekh Hashem']);
    if (result.rows.length === 0) {
      throw new Error('Derekh Hashem work not found in database');
    }
    workId = result.rows[0].id;
  } finally {
    client.release();
  }
  
  let totalChunks = 0;
  let processedSections = 0;
  let failedSections = 0;
  
  for (const section of MISSING_SECTIONS) {
    try {
      console.log(`\\n📄 Fetching ${section}...`);
      
      // Fetch text from Sefaria  
      const textResult = await getTextV3(section, { lang: 'bi' });
      
      if (!textResult || !textResult.text) {
        console.warn(`  ⚠️  No text found for ${section}`);
        failedSections++;
        continue;
      }
      
      console.log(`  ✅ Fetched ${textResult.text.length} characters`);
      
      // Chunk the text into smaller pieces
      const chunks = chunkText(textResult.text, 500, 50);
      console.log(`  ⚙️  Created ${chunks.length} chunks`);
      
      if (chunks.length === 0) {
        console.warn(`  ⚠️  No chunks created for ${section}`);
        failedSections++;
        continue;
      }
      
      // Save chunks to database
      const savedCount = await saveTextChunks(workId, section, chunks);
      console.log(`  💾 Saved ${savedCount}/${chunks.length} chunks`);
      
      totalChunks += savedCount;
      processedSections++;
      
      // Rate limiting - don't overwhelm Sefaria
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`  ❌ Failed to process ${section}:`, error.message);
      failedSections++;
    }
  }
  
  console.log(`\\n✅ Missing sections processing complete:`);
  console.log(`   📄 Processed sections: ${processedSections}/${MISSING_SECTIONS.length}`);
  console.log(`   📝 Total new chunks: ${totalChunks}`);
  console.log(`   ❌ Failed sections: ${failedSections}`);
  
  // Verify final database state
  console.log('\\n📊 Verifying updated database...');
  const finalClient = await pool.connect();
  try {
    const counts = await finalClient.query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(DISTINCT work_id) as unique_works,
        COUNT(embedding_english) as chunks_with_embeddings
      FROM text_chunks 
      WHERE content_english IS NOT NULL
    `);
    
    const stats = counts.rows[0];
    console.log(`📈 Updated Database Stats:`);
    console.log(`   📝 Total text chunks: ${stats.total_chunks}`);
    console.log(`   🧠 Chunks with embeddings: ${stats.chunks_with_embeddings}`);
    console.log(`   🆕 New chunks needing embeddings: ${stats.total_chunks - stats.chunks_with_embeddings}`);
    
  } finally {
    finalClient.release();
  }
  
  console.log(`\\n🚀 Next steps:`);
  console.log(`1. Generate embeddings for new chunks: npm run generate-embeddings`);
  console.log(`2. Test specific queries like "Sh'ma and Its Blessings"`);
  
  return {
    processedSections,
    totalChunks,
    failedSections
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    await processMissingSections();
  } catch (error) {
    console.error('💥 Processing failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n👋 Stopping processing...');
  await pool.end();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { processMissingSections, MISSING_SECTIONS };