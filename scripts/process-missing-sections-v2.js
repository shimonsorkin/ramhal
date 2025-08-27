/**
 * Process missing sections from Derekh Hashem - SIMPLIFIED VERSION
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
  // Part Four - the critical ones!
  'Derekh Hashem, Part Four, On the Sh\'ma and Its Blessings', // ← USER'S QUESTION!
  'Derekh Hashem, Part Four, On Love and Fear of God',
  'Derekh Hashem, Part Four, On the Daily Order of Prayer',
  'Derekh Hashem, Part Four, On Divine Service and the Calendar',
  'Derekh Hashem, Part Four, On Seasonal Commandments',
  'Derekh Hashem, Part Four, On Blessings'
];

/**
 * Enhanced text fetching
 */
async function getTextV3(tref, opts = {}) {
  const { lang = 'en' } = opts;
  const apiRef = encodeURIComponent(tref);
  const params = new URLSearchParams();
  params.set('lang', lang === 'he' ? 'he' : 'bi');
  const url = `https://www.sefaria.org/api/texts/${apiRef}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`⚠️  Text not found: ${tref}`);
      return null;
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
      he: extractText(data.he)
    };
  } catch (error) {
    console.error(`❌ Failed to fetch ${tref}:`, error.message);
    return null;
  }
}

/**
 * Simple text chunking that actually works
 */
function simpleChunkText(text, maxLength = 400) {
  if (!text || text.trim().length === 0) return [];
  
  const cleanText = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  
  if (cleanText.length <= maxLength) {
    return [cleanText];
  }
  
  // Split into sentences first
  const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 30);
}

/**
 * Save chunks with better error handling
 */
async function saveChunksToProduction(workId, sectionName, chunks) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let savedCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const chunkRef = `${sectionName}:${i + 1}`;
      const wordCount = content.split(/\s+/).length;
      
      // Check if exists first
      const existsResult = await client.query(
        'SELECT id FROM text_chunks WHERE tref = $1', 
        [chunkRef]
      );
      
      if (existsResult.rows.length === 0) {
        try {
          await client.query(`
            INSERT INTO text_chunks (
              work_id, tref, canonical_ref, content_english, chunk_type,
              word_count, character_count, paragraph_number
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            workId, chunkRef, chunkRef, content, 'paragraph',
            wordCount, content.length, i + 1
          ]);
          savedCount++;
          console.log(`    ✅ Saved chunk ${i + 1}: ${content.substring(0, 60)}...`);
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
 * Main processing function
 */
async function processMissingSections() {
  console.log('🚀 Processing Critical Missing Sections\n');
  
  // Get Derekh Hashem work ID
  const client = await pool.connect();
  let workId;
  try {
    const result = await client.query('SELECT id FROM works WHERE title = $1', ['Derekh Hashem']);
    if (result.rows.length === 0) {
      throw new Error('Derekh Hashem work not found in database');
    }
    workId = result.rows[0].id;
    console.log(`📚 Found Derekh Hashem work ID: ${workId}`);
  } finally {
    client.release();
  }
  
  let totalNewChunks = 0;
  
  for (const section of MISSING_SECTIONS) {
    try {
      console.log(`\n📄 Processing: ${section}`);
      
      const textResult = await getTextV3(section, { lang: 'bi' });
      if (!textResult || !textResult.text) {
        console.warn(`  ❌ No text found`);
        continue;
      }
      
      console.log(`  📖 Fetched ${textResult.text.length} characters`);
      
      const chunks = simpleChunkText(textResult.text, 400);
      console.log(`  ⚙️  Created ${chunks.length} chunks`);
      
      if (chunks.length > 0) {
        const savedCount = await saveChunksToProduction(workId, section, chunks);
        console.log(`  💾 Saved ${savedCount}/${chunks.length} new chunks`);
        totalNewChunks += savedCount;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Failed to process ${section}:`, error.message);
    }
  }
  
  console.log(`\n🎉 Processing Complete!`);
  console.log(`📝 Total new chunks added: ${totalNewChunks}`);
  
  if (totalNewChunks > 0) {
    console.log(`\n🚀 Next Steps:`);
    console.log(`1. Generate embeddings: npm run generate-embeddings`);
    console.log(`2. Test: "What does the second paragraph of On the Sh'ma say?"`);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    await processMissingSections();
  } catch (error) {
    console.error('💥 Processing failed:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}