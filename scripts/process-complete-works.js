/**
 * Process complete Ramchal works for comprehensive semantic search
 * Fetches and processes entire works, not just sample chapters
 */

const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

// Comprehensive list of Ramchal works and chapters to process
const RAMCHAL_WORKS = [
  {
    title: 'Mesillat Yesharim',
    hebrewTitle: 'מסילת ישרים',
    alternativeTitles: ['Mesilat Yesharim', 'Path of the Just'],
    description: 'Guide to ethical and spiritual perfection',
    sefariaTitle: 'Mesillat Yesharim',
    chapters: [
      'Mesillat Yesharim 1',
      'Mesillat Yesharim 2', 
      'Mesillat Yesharim 3',
      'Mesillat Yesharim 4',
      'Mesillat Yesharim 5',
      'Mesillat Yesharim 6',
      'Mesillat Yesharim 7',
      'Mesillat Yesharim 8',
      'Mesillat Yesharim 9',
      'Mesillat Yesharim 10',
      'Mesillat Yesharim 11',
      'Mesillat Yesharim 12',
      'Mesillat Yesharim 13',
      'Mesillat Yesharim 14',
      'Mesillat Yesharim 15',
      'Mesillat Yesharim 16',
      'Mesillat Yesharim 17',
      'Mesillat Yesharim 18',
      'Mesillat Yesharim 19'
    ]
  },
  {
    title: 'Derekh Hashem',
    hebrewTitle: 'דרך השם',
    alternativeTitles: ['Derech Hashem', 'The Way of God'],
    description: 'Systematic exposition of Jewish theology and philosophy',
    sefariaTitle: 'Derekh Hashem',
    chapters: [
      'Derekh Hashem, Introduction',
      'Derekh Hashem, Part One, On the Creator',
      'Derekh Hashem, Part One, On the Purpose of Creation',
      'Derekh Hashem, Part One, On Mankind',
      'Derekh Hashem, Part One, On Human Responsibility',
      'Derekh Hashem, Part One, On the Spiritual Realm',
      'Derekh Hashem, Part Two, On Divine Providence in General',
      'Derekh Hashem, Part Two, On Mankind in This World',
      'Derekh Hashem, Part Two, On Personal Providence',
      'Derekh Hashem, Part Two, On Israel and the Nations',
      'Derekh Hashem, Part Three, On the Soul and Its Activities',
      'Derekh Hashem, Part Three, On Divine Names and Witchcraft', 
      'Derekh Hashem, Part Three, On Divine Inspiration and Prophecy',
      'Derekh Hashem, Part Four, On Divine Service',
      'Derekh Hashem, Part Four, On Torah Study',
      'Derekh Hashem, Part Four, On Prayer'
    ]
  },
  {
    title: 'Da\'at Tevunot',
    hebrewTitle: 'דעת תבונות',
    alternativeTitles: ['Daat Tevunot', 'Knowledge of Understanding'],
    description: 'Dialogue on divine providence and theodicy',
    sefariaTitle: 'Da\'at Tevunot',
    chapters: [
      'Da\'at Tevunot 1',
      'Da\'at Tevunot 2',
      'Da\'at Tevunot 3',
      'Da\'at Tevunot 4',
      'Da\'at Tevunot 5',
      'Da\'at Tevunot 6',
      'Da\'at Tevunot 7',
      'Da\'at Tevunot 8',
      'Da\'at Tevunot 9',
      'Da\'at Tevunot 10'
    ]
  }
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
      const sentences = paragraph.split(/[.!?]+\s+/).filter(s => s.trim());
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
 * Database operations
 */
async function ensureAuthor(name, hebrewName) {
  const client = await pool.connect();
  try {
    let result = await client.query('SELECT id FROM authors WHERE name = $1', [name]);
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    result = await client.query(
      'INSERT INTO authors (name, hebrew_name) VALUES ($1, $2) RETURNING id',
      [name, hebrewName || null]
    );
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

async function ensureWork(authorId, title, hebrewTitle, alternativeTitles = [], description = '', sefariaIndexTitle = '') {
  const client = await pool.connect();
  try {
    let result = await client.query(
      'SELECT id FROM works WHERE title = $1 AND author_id = $2',
      [title, authorId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    result = await client.query(`
      INSERT INTO works (author_id, title, hebrew_title, alternative_titles, description, sefaria_index_title)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [authorId, title, hebrewTitle || null, alternativeTitles, description, sefariaIndexTitle]);
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

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
 * Process a single work completely
 */
async function processWork(workData) {
  console.log(`\n📚 Processing ${workData.title}...`);
  console.log(`📖 ${workData.chapters.length} chapters to process`);
  
  // Ensure author and work exist in database
  const ramchalAuthorId = await ensureAuthor(
    'Rabbi Moshe Chaim Luzzatto',
    'רבי משה חיים לוצאטו'
  );
  
  const workId = await ensureWork(
    ramchalAuthorId,
    workData.title,
    workData.hebrewTitle,
    workData.alternativeTitles,
    workData.description,
    workData.sefariaTitle
  );
  
  let totalChunks = 0;
  let processedChapters = 0;
  let failedChapters = 0;
  
  for (const chapterRef of workData.chapters) {
    try {
      console.log(`  📄 Fetching ${chapterRef}...`);
      
      // Fetch text from Sefaria
      const textResult = await getTextV3(chapterRef, { lang: 'bi' });
      
      if (!textResult || !textResult.text) {
        console.warn(`  ⚠️  No text found for ${chapterRef}`);
        failedChapters++;
        continue;
      }
      
      console.log(`  ✅ Fetched ${textResult.text.length} characters`);
      
      // Chunk the text with better parameters
      const chunks = chunkText(textResult.text, 600, 100);
      console.log(`  ⚙️  Created ${chunks.length} chunks`);
      
      if (chunks.length === 0) {
        console.warn(`  ⚠️  No chunks created for ${chapterRef}`);
        failedChapters++;
        continue;
      }
      
      // Save chunks to database
      const savedCount = await saveTextChunks(workId, chapterRef, chunks);
      console.log(`  💾 Saved ${savedCount}/${chunks.length} chunks`);
      
      totalChunks += savedCount;
      processedChapters++;
      
      // Rate limiting - don't overwhelm Sefaria
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Failed to process ${chapterRef}:`, error.message);
      failedChapters++;
    }
  }
  
  console.log(`✅ ${workData.title} complete:`);
  console.log(`   📄 Processed chapters: ${processedChapters}/${workData.chapters.length}`);
  console.log(`   📝 Total chunks created: ${totalChunks}`);
  console.log(`   ❌ Failed chapters: ${failedChapters}`);
  
  return { processedChapters, totalChunks, failedChapters };
}

/**
 * Main processing function
 */
async function processAllWorks() {
  console.log('🚀 Processing Complete Ramchal Works for Semantic Search\n');
  console.log(`📚 ${RAMCHAL_WORKS.length} works to process`);
  
  let grandTotalChunks = 0;
  let grandTotalChapters = 0;
  let grandTotalFailed = 0;
  
  const startTime = Date.now();
  
  for (const work of RAMCHAL_WORKS) {
    try {
      const result = await processWork(work);
      grandTotalChunks += result.totalChunks;
      grandTotalChapters += result.processedChapters;
      grandTotalFailed += result.failedChapters;
      
      // Pause between works
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`💥 Failed to process ${work.title}:`, error.message);
    }
  }
  
  const processingTime = Date.now() - startTime;
  
  // Verify final database state
  console.log('\n📊 Verifying database contents...');
  const client = await pool.connect();
  try {
    const counts = await client.query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(DISTINCT work_id) as unique_works,
        COUNT(embedding_english) as chunks_with_embeddings,
        AVG(word_count) as avg_word_count
      FROM text_chunks 
      WHERE content_english IS NOT NULL
    `);
    
    const stats = counts.rows[0];
    console.log(`📈 Final Database Stats:`);
    console.log(`   📝 Total text chunks: ${stats.total_chunks}`);
    console.log(`   📚 Unique works: ${stats.unique_works}`);
    console.log(`   🧠 Chunks with embeddings: ${stats.chunks_with_embeddings}`);
    console.log(`   📊 Average words per chunk: ${parseFloat(stats.avg_word_count).toFixed(1)}`);
    
  } finally {
    client.release();
  }
  
  console.log(`\n🎉 PROCESSING COMPLETE!`);
  console.log(`⏱️  Total time: ${(processingTime / 1000 / 60).toFixed(1)} minutes`);
  console.log(`📄 Chapters processed: ${grandTotalChapters}`);
  console.log(`📝 Chunks created: ${grandTotalChunks}`);
  console.log(`❌ Failed chapters: ${grandTotalFailed}`);
  
  console.log(`\n🚀 Next steps:`);
  console.log(`1. Generate embeddings: npm run generate-embeddings`);
  console.log(`2. Test semantic search: npm run test-semantic-search`);
  console.log(`3. Test the improved API: npm run test-api-integration`);
  
  return {
    totalChunks: grandTotalChunks,
    totalChapters: grandTotalChapters,
    failedChapters: grandTotalFailed,
    processingTimeMinutes: processingTime / 1000 / 60
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    await processAllWorks();
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

module.exports = { processAllWorks, processWork, RAMCHAL_WORKS };