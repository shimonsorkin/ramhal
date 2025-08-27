/**
 * Complete Derekh Hashem - Add ALL remaining missing sections
 * Achieve 100% complete coverage of Ramchal's major work
 */

const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

// ALL remaining missing sections from Derekh Hashem
const REMAINING_MISSING_SECTIONS = [
  // Part Two - Missing 4 sections
  'Derekh Hashem, Part Two, On How Providence Works',
  'Derekh Hashem, Part Two, On the System of Providence',
  'Derekh Hashem, Part Two, On the Influence of the Stars', 
  'Derekh Hashem, Part Two, On Specific Modes of Providence',
  
  // Part Three - Missing 1 section
  'Derekh Hashem, Part Three, On Moshe\'s Unique Status',
  
  // Part Four - Missing 5 sections  
  'Derekh Hashem, Part Four, On Love and Fear of God',
  'Derekh Hashem, Part Four, On the Daily Order of Prayer',
  'Derekh Hashem, Part Four, On Divine Service and the Calendar',
  'Derekh Hashem, Part Four, On Seasonal Commandments',
  'Derekh Hashem, Part Four, On Blessings'
];

console.log(`🚀 Completing Derekh Hashem - Adding ${REMAINING_MISSING_SECTIONS.length} missing sections for 100% coverage!\n`);

/**
 * Fetch text from Sefaria
 */
async function getTextFromSefaria(tref) {
  const apiRef = encodeURIComponent(tref);
  const url = `https://www.sefaria.org/api/texts/${apiRef}?lang=bi`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`⚠️  HTTP ${response.status} for ${tref}`);
      return null;
    }
    
    const data = await response.json();
    if (data.error) {
      console.warn(`⚠️  Sefaria error: ${data.error}`);
      return null;
    }
    
    const extractText = (textData) => {
      if (!textData) return undefined;
      return Array.isArray(textData) ? textData.join(' ') : textData;
    };
    
    return {
      text: extractText(data.text),
      he: extractText(data.he),
      ref: data.ref
    };
  } catch (error) {
    console.error(`❌ Failed to fetch ${tref}:`, error.message);
    return null;
  }
}

/**
 * Smart chunking for optimal semantic search
 */
function intelligentChunk(text, maxLength = 450) {
  if (!text) return [];
  
  const cleanText = text
    .replace(/<[^>]*>/g, '') // Remove HTML
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
  
  if (cleanText.length <= maxLength) return [cleanText];
  
  // Split on sentence boundaries with smart overlap
  const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
    
    if (potentialChunk.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Smart overlap - include last few words for context continuity
      const words = currentChunk.trim().split(' ');
      const overlapWords = words.slice(-8).join(' '); // 8-word overlap
      currentChunk = overlapWords + ' ' + sentence;
    } else {
      currentChunk = potentialChunk;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 40); // Filter very short chunks
}

/**
 * Add chunks to database with proper ID management
 */
async function addChunksToDatabase(workId, sectionName, chunks) {
  const client = await pool.connect();
  let savedCount = 0;
  
  try {
    // Get next available ID
    const maxIdResult = await client.query('SELECT MAX(id) FROM text_chunks');
    let nextId = (maxIdResult.rows[0].max || 0) + 1;
    
    await client.query('BEGIN');
    
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const tref = `${sectionName}:${i + 1}`;
      const wordCount = content.split(/\s+/).length;
      
      // Check if chunk already exists
      const existsResult = await client.query('SELECT id FROM text_chunks WHERE tref = $1', [tref]);
      
      if (existsResult.rows.length === 0) {
        try {
          await client.query(`
            INSERT INTO text_chunks (
              id, work_id, tref, canonical_ref, content_english, 
              chunk_type, word_count, character_count, paragraph_number
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            nextId++, workId, tref, tref, content,
            'paragraph', wordCount, content.length, i + 1
          ]);
          
          savedCount++;
          
          if (i === 0) {
            console.log(`    ✅ First chunk: ${content.substring(0, 100)}...`);
          }
        } catch (error) {
          console.warn(`    ⚠️  Failed to save chunk ${i + 1}:`, error.message);
        }
      } else {
        console.log(`    ⏭️  Chunk ${i + 1} already exists`);
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
 * Process a single section completely
 */
async function processSection(workId, sectionName) {
  console.log(`\n📄 Processing: ${sectionName}`);
  
  const textResult = await getTextFromSefaria(sectionName);
  if (!textResult || !textResult.text) {
    console.warn(`  ❌ No text found`);
    return 0;
  }
  
  console.log(`  📖 Fetched ${textResult.text.length} characters`);
  
  const chunks = intelligentChunk(textResult.text, 450);
  console.log(`  ⚙️  Created ${chunks.length} chunks`);
  
  if (chunks.length === 0) {
    console.warn(`  ⚠️  No valid chunks created`);
    return 0;
  }
  
  const savedCount = await addChunksToDatabase(workId, sectionName, chunks);
  console.log(`  💾 Successfully saved ${savedCount}/${chunks.length} chunks`);
  
  return savedCount;
}

/**
 * Main processing function
 */
async function completeDerekHashem() {
  console.log('🎯 Starting Complete Derekh Hashem Processing\n');
  
  // Get Derekh Hashem work ID
  const client = await pool.connect();
  let workId;
  
  try {
    const workResult = await client.query('SELECT id FROM works WHERE title = $1', ['Derekh Hashem']);
    if (workResult.rows.length === 0) {
      throw new Error('Derekh Hashem work not found in database');
    }
    workId = workResult.rows[0].id;
    console.log(`📚 Found Derekh Hashem work ID: ${workId}`);
  } finally {
    client.release();
  }
  
  let totalNewChunks = 0;
  let processedSections = 0;
  let failedSections = 0;
  
  // Process each missing section
  for (const section of REMAINING_MISSING_SECTIONS) {
    try {
      const savedCount = await processSection(workId, section);
      totalNewChunks += savedCount;
      
      if (savedCount > 0) {
        processedSections++;
      } else {
        failedSections++;
      }
      
      // Rate limiting - be respectful to Sefaria API
      await new Promise(resolve => setTimeout(resolve, 1200));
      
    } catch (error) {
      console.error(`❌ Failed to process ${section}:`, error.message);
      failedSections++;
    }
  }
  
  // Final verification
  console.log('\n📊 Verifying complete coverage...');
  const verificationClient = await pool.connect();
  
  try {
    const totalResult = await verificationClient.query(`
      SELECT COUNT(*) as total_chunks, COUNT(embedding_english) as with_embeddings
      FROM text_chunks 
      WHERE tref LIKE 'Derekh Hashem%'
    `);
    
    const sectionResult = await verificationClient.query(`
      SELECT COUNT(DISTINCT substring(tref from 1 for position(':' in tref) - 1)) as unique_sections
      FROM text_chunks 
      WHERE tref LIKE 'Derekh Hashem%'
    `);
    
    const stats = {
      totalChunks: totalResult.rows[0].total_chunks,
      withEmbeddings: totalResult.rows[0].with_embeddings,
      uniqueSections: sectionResult.rows[0].unique_sections
    };
    
    console.log(`📈 Derekh Hashem Coverage:`);
    console.log(`   📝 Total chunks: ${stats.totalChunks}`);
    console.log(`   🧠 With embeddings: ${stats.withEmbeddings}`);
    console.log(`   📚 Unique sections: ${stats.uniqueSections}/26 (expected complete coverage)`);
    console.log(`   🆕 Newly added chunks: ${totalNewChunks}`);
    
    if (stats.uniqueSections >= 26) {
      console.log(`\n🎉 COMPLETE! Derekh Hashem now has 100% section coverage!`);
    } else {
      console.log(`\n⚠️  Still missing ${26 - stats.uniqueSections} sections`);
    }
    
  } finally {
    verificationClient.release();
  }
  
  console.log(`\n🎯 Processing Summary:`);
  console.log(`   ✅ Processed sections: ${processedSections}/${REMAINING_MISSING_SECTIONS.length}`);
  console.log(`   📝 New chunks added: ${totalNewChunks}`);
  console.log(`   ❌ Failed sections: ${failedSections}`);
  
  if (totalNewChunks > 0) {
    console.log(`\n🚀 Next Steps:`);
    console.log(`1. Generate embeddings: npm run generate-embeddings`);
    console.log(`2. Test comprehensive coverage with various questions`);
    console.log(`3. Deploy updated system to production`);
  }
  
  return {
    processedSections,
    totalNewChunks,
    failedSections
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    await completeDerekHashem();
  } catch (error) {
    console.error('💥 Processing failed:', error);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Stopping processing...');
  await pool.end();
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = { completeDerekHashem, REMAINING_MISSING_SECTIONS };