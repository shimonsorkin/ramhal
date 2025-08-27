/**
 * Add missing critical content to production database
 */

const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

const CRITICAL_SECTIONS = [
  'Derekh Hashem, Part Four, On the Sh\'ma and Its Blessings'
];

async function getTextV3(tref) {
  const apiRef = encodeURIComponent(tref);
  const url = `https://www.sefaria.org/api/texts/${apiRef}?lang=bi`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.error) return null;
    
    const extractText = (textData) => {
      return Array.isArray(textData) ? textData.join(' ') : textData;
    };
    
    return {
      text: extractText(data.text),
      he: extractText(data.he)
    };
  } catch (error) {
    console.error(`Failed to fetch ${tref}:`, error.message);
    return null;
  }
}

function chunkText(text, maxLength = 400) {
  if (!text) return [];
  
  const cleanText = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (cleanText.length <= maxLength) return [cleanText];
  
  const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    }
  }
  
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.filter(chunk => chunk.length > 30);
}

async function addMissingContent() {
  console.log('🚀 Adding Missing Critical Content\n');
  
  const client = await pool.connect();
  let nextId;
  
  try {
    // Get next available ID
    const maxIdResult = await client.query('SELECT MAX(id) FROM text_chunks');
    nextId = (maxIdResult.rows[0].max || 0) + 1;
    console.log(`Starting with ID: ${nextId}`);
    
    // Get work ID
    const workResult = await client.query('SELECT id FROM works WHERE title = $1', ['Derekh Hashem']);
    const workId = workResult.rows[0].id;
    
    for (const section of CRITICAL_SECTIONS) {
      console.log(`\n📄 Processing: ${section}`);
      
      const textResult = await getTextV3(section);
      if (!textResult || !textResult.text) {
        console.warn(`  ❌ No text found`);
        continue;
      }
      
      console.log(`  📖 Fetched ${textResult.text.length} characters`);
      
      const chunks = chunkText(textResult.text, 400);
      console.log(`  ⚙️  Created ${chunks.length} chunks`);
      
      let savedCount = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i];
        const tref = `${section}:${i + 1}`;
        const wordCount = content.split(/\s+/).length;
        
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
          if (i < 3) { // Show first few chunks
            console.log(`    ✅ Chunk ${i + 1}: ${content.substring(0, 80)}...`);
          }
        } catch (error) {
          console.warn(`    ⚠️  Failed to save chunk ${i + 1}:`, error.message);
        }
      }
      
      console.log(`  💾 Successfully saved ${savedCount}/${chunks.length} chunks`);
      
      if (savedCount > 0) {
        console.log(`\n🎯 Testing with a sample chunk...`);
        const testQuery = `SELECT tref, substring(content_english, 1, 100) as sample 
                          FROM text_chunks 
                          WHERE tref LIKE '${section}:%' 
                          LIMIT 3`;
        const testResult = await client.query(testQuery);
        
        testResult.rows.forEach((row, idx) => {
          console.log(`    ${idx + 1}. ${row.tref}: ${row.sample}...`);
        });
      }
    }
    
  } finally {
    client.release();
  }
  
  console.log(`\n🎉 Content addition complete!`);
  console.log(`🚀 Next: Generate embeddings for new content`);
}

async function main() {
  try {
    await addMissingContent();
  } catch (error) {
    console.error('💥 Failed:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}