/**
 * Complete Da'at Tevunot loading script
 * Specifically handles the mixed English/Spanish content on Sefaria
 */

const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

// All known Da'at Tevunot sections to try
const DAAT_TEVUNOT_SECTIONS = [];
for (let i = 1; i <= 200; i++) {  // Try a wide range
  DAAT_TEVUNOT_SECTIONS.push(`Da'at Tevunot ${i}`);
}

/**
 * Enhanced text fetching with language detection
 */
async function getTextV3(tref, opts = {}) {
  const { lang = 'bi' } = opts;
  const apiRef = encodeURIComponent(tref);
  const params = new URLSearchParams();
  params.set('lang', lang);

  const url = `https://www.sefaria.org/api/texts/${apiRef}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        return null;  // Section doesn't exist
      }
      throw new Error(`Sefaria API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      return null;
    }
    
    const extractText = (textData) => {
      if (!textData) return undefined;
      if (Array.isArray(textData)) {
        return textData.filter(t => t && t.trim()).join(' ');
      }
      return textData;
    };
    
    const result = {
      ref: data.ref,
      text: extractText(data.text),
      he: extractText(data.he),
      versions: data.versions || []
    };

    // Detect if text is in English vs Spanish
    if (result.text) {
      const isSpanish = /\b(dijo|alma|deseo|voluntad|está|entre|aquellos|sobre|cuales)\b/i.test(result.text);
      result.isSpanish = isSpanish;
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Failed to fetch ${tref}:`, error.message);
    return null;
  }
}

/**
 * Enhanced text chunking 
 */
function chunkText(text, maxLength = 600, overlapSize = 100) {
  if (!text || text.trim().length === 0) return [];
  
  const cleanText = text
    .replace(/<[^>]*>/g, '') 
    .replace(/\s+/g, ' ')   
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  
  const paragraphs = cleanText.split(/\n\s*\n/);
  const chunks = [];
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) continue;
    
    if (paragraph.length <= maxLength) {
      chunks.push(paragraph.trim());
    } else {
      const sentences = paragraph.split(/[.!?]+\s+/).filter(s => s.trim());
      let currentChunk = '';
      let previousChunk = '';
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence + '.';
        
        if (potentialChunk.length > maxLength && currentChunk.length > 0) {
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
  
  return chunks.filter(chunk => chunk.length > 50);
}

/**
 * Clear existing Da'at Tevunot data
 */
async function clearExistingData() {
  const client = await pool.connect();
  try {
    console.log('🧹 Clearing existing Da\'at Tevunot data...');
    
    const result = await client.query(`
      DELETE FROM text_chunks 
      WHERE work_id IN (
        SELECT id FROM works WHERE title ILIKE '%Da''at Tevunot%' OR title ILIKE '%Daat Tevunot%'
      )
    `);
    
    console.log(`✅ Cleared ${result.rowCount} existing chunks`);
    
  } finally {
    client.release();
  }
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
        await client.query(`
          INSERT INTO text_chunks (
            work_id, tref, canonical_ref, content_english, chunk_type,
            word_count, character_count, paragraph_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tref) DO UPDATE SET
            content_english = EXCLUDED.content_english,
            word_count = EXCLUDED.word_count,
            character_count = EXCLUDED.character_count,
            updated_at = CURRENT_TIMESTAMP
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
 * Get or create work ID for Da'at Tevunot
 */
async function getWorkId() {
  const client = await pool.connect();
  try {
    // First check if author exists
    let result = await client.query('SELECT id FROM authors WHERE name = $1', ['Rabbi Moshe Chaim Luzzatto']);
    let authorId;
    
    if (result.rows.length === 0) {
      result = await client.query(
        'INSERT INTO authors (name, hebrew_name) VALUES ($1, $2) RETURNING id',
        ['Rabbi Moshe Chaim Luzzatto', 'רבי משה חיים לוצאטו']
      );
      authorId = result.rows[0].id;
    } else {
      authorId = result.rows[0].id;
    }
    
    // Check if work exists
    result = await client.query(
      'SELECT id FROM works WHERE author_id = $1 AND (title ILIKE $2 OR title ILIKE $3)',
      [authorId, '%Da\'at Tevunot%', '%Daat Tevunot%']
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    // Create work
    result = await client.query(`
      INSERT INTO works (author_id, title, hebrew_title, description, sefaria_index_title)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      authorId,
      'Da\'at Tevunot',
      'דעת תבונות',
      'Dialogue on divine providence and theodicy',
      'Da\'at Tevunot'
    ]);
    
    return result.rows[0].id;
    
  } finally {
    client.release();
  }
}

/**
 * Process all Da'at Tevunot sections
 */
async function processDataTevunot() {
  console.log('🚀 Processing Complete Da\'at Tevunot...\n');
  
  // Clear existing data first
  await clearExistingData();
  
  const workId = await getWorkId();
  console.log(`📚 Work ID: ${workId}`);
  
  let totalChunks = 0;
  let processedSections = 0;
  let spanishSections = 0;
  let missingSections = 0;
  
  console.log(`🔍 Checking all sections for available English content...\n`);
  
  for (const sectionRef of DAAT_TEVUNOT_SECTIONS) {
    try {
      const textResult = await getTextV3(sectionRef, { lang: 'bi' });
      
      if (!textResult || !textResult.text) {
        missingSections++;
        continue;
      }
      
      // Skip Spanish sections
      if (textResult.isSpanish) {
        console.log(`  🇪🇸 ${sectionRef}: Spanish content, skipping`);
        spanishSections++;
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }
      
      console.log(`  🇬🇧 ${sectionRef}: English content found (${textResult.text.length} chars)`);
      
      // Chunk the text
      const chunks = chunkText(textResult.text, 600, 100);
      console.log(`     ⚙️  Created ${chunks.length} chunks`);
      
      if (chunks.length === 0) {
        console.warn(`     ⚠️  No chunks created`);
        continue;
      }
      
      // Save chunks to database
      const savedCount = await saveTextChunks(workId, sectionRef, chunks);
      console.log(`     💾 Saved ${savedCount}/${chunks.length} chunks`);
      
      totalChunks += savedCount;
      processedSections++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Failed to process ${sectionRef}:`, error.message);
      missingSections++;
    }
  }
  
  console.log(`\n✅ Da'at Tevunot processing complete:`);
  console.log(`   📄 English sections processed: ${processedSections}`);
  console.log(`   🇪🇸 Spanish sections skipped: ${spanishSections}`);  
  console.log(`   ❌ Missing sections: ${missingSections}`);
  console.log(`   📝 Total chunks created: ${totalChunks}`);
  
  // Verify final database state
  console.log('\n📊 Verifying database contents...');
  const client = await pool.connect();
  try {
    const counts = await client.query(`
      SELECT 
        COUNT(*) as total_chunks,
        SUM(word_count) as total_words,
        AVG(word_count) as avg_word_count,
        MIN(tref) as first_ref,
        MAX(tref) as last_ref
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      WHERE w.title ILIKE '%Da''at Tevunot%' OR w.title ILIKE '%Daat Tevunot%'
    `);
    
    const stats = counts.rows[0];
    console.log(`📈 Final Da'at Tevunot Stats:`);
    console.log(`   📝 Total chunks: ${stats.total_chunks}`);
    console.log(`   📊 Total words: ${stats.total_words}`);
    console.log(`   📊 Average words per chunk: ${parseFloat(stats.avg_word_count || 0).toFixed(1)}`);
    console.log(`   📚 First reference: ${stats.first_ref}`);
    console.log(`   📚 Last reference: ${stats.last_ref}`);
    
  } finally {
    client.release();
  }
  
  return {
    totalChunks,
    processedSections,
    spanishSections,
    missingSections
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    await processDataTevunot();
    console.log('\n🎉 Da\'at Tevunot loading complete!');
  } catch (error) {
    console.error('💥 Processing failed:', error.message);
    console.error('Stack:', error.stack);
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

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { processDataTevunot };