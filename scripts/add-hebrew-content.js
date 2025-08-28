/**
 * Add Hebrew original texts to all three Ramchal works
 * Updates existing chunks with Hebrew content from Sefaria API
 */

const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ramhal_dev'
});

/**
 * Enhanced text fetching with Hebrew focus
 */
async function getHebrewText(tref) {
  const ramchalTitles = [
    'Mesillat Yesharim', 'Mesilat Yesharim',
    'Da\'at Tevunot', 'Daat Tevunot',
    'Derekh Hashem'
  ];
  
  const isRamchalText = ramchalTitles.some(title => tref.includes(title));
  const apiRef = isRamchalText ? encodeURIComponent(tref) : tref.replace(/\s+/g, '.').replace(/:/g, '.');
  
  const params = new URLSearchParams();
  params.set('lang', 'he');  // Hebrew only

  const url = `https://www.sefaria.org/api/texts/${apiRef}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`⚠️  Hebrew text not found: ${tref}`);
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
      if (Array.isArray(textData)) {
        return textData.filter(t => t && t.trim()).join(' ');
      }
      return textData;
    };
    
    const hebrewText = extractText(data.he);
    
    if (!hebrewText || hebrewText.trim().length === 0) {
      console.warn(`⚠️  No Hebrew content found for ${tref}`);
      return null;
    }
    
    // Clean HTML tags from Hebrew text
    const cleanHebrew = hebrewText
      .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
    
    return {
      ref: data.ref,
      hebrew: cleanHebrew
    };
  } catch (error) {
    console.error(`❌ Failed to fetch Hebrew for ${tref}:`, error.message);
    return null;
  }
}

/**
 * Chunk Hebrew text to match English chunks
 */
function chunkHebrewText(hebrewText, targetChunkCount, maxLength = 600) {
  if (!hebrewText || hebrewText.trim().length === 0) return [];
  
  const cleanText = hebrewText.trim();
  
  // If we need only one chunk, return the whole text (truncated if needed)
  if (targetChunkCount === 1) {
    return [cleanText.substring(0, maxLength)];
  }
  
  // Split by sentences (Hebrew punctuation)
  const sentences = cleanText.split(/[\.!?׃]+/).filter(s => s.trim());
  
  if (sentences.length <= targetChunkCount) {
    // If we have fewer sentences than target chunks, return one sentence per chunk
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }
  
  // Distribute sentences evenly across target chunk count
  const chunks = [];
  const sentencesPerChunk = Math.ceil(sentences.length / targetChunkCount);
  
  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
    const chunk = chunkSentences.join('. ').trim();
    
    if (chunk.length > 0) {
      // Truncate if too long
      chunks.push(chunk.substring(0, maxLength));
    }
  }
  
  // Ensure we have exactly the target number of chunks
  while (chunks.length < targetChunkCount && chunks.length > 0) {
    // Split the longest chunk
    const longestIndex = chunks.reduce((maxIdx, chunk, idx) => 
      chunk.length > chunks[maxIdx].length ? idx : maxIdx, 0);
    
    const longChunk = chunks[longestIndex];
    const midPoint = Math.floor(longChunk.length / 2);
    const split1 = longChunk.substring(0, midPoint).trim();
    const split2 = longChunk.substring(midPoint).trim();
    
    if (split1 && split2) {
      chunks[longestIndex] = split1;
      chunks.push(split2);
    } else {
      break;
    }
  }
  
  return chunks.slice(0, targetChunkCount);  // Ensure exact count
}

/**
 * Update existing chunks with Hebrew content
 */
async function updateChunksWithHebrew(workTitle) {
  console.log(`\n📚 Processing Hebrew content for ${workTitle}...`);
  
  const client = await pool.connect();
  try {
    // Get all existing chunks for this work, grouped by base reference
    const chunksResult = await client.query(`
      SELECT 
        tc.tref,
        tc.id as chunk_id,
        SPLIT_PART(tc.tref, ':', 1) as base_ref
      FROM text_chunks tc
      JOIN works w ON tc.work_id = w.id
      WHERE w.title = $1
      ORDER BY tc.tref
    `, [workTitle]);
    
    const chunks = chunksResult.rows;
    console.log(`📄 Found ${chunks.length} existing chunks`);
    
    // Group chunks by base reference (e.g., "Mesillat Yesharim 1")
    const groupedChunks = {};
    chunks.forEach(chunk => {
      const baseRef = chunk.base_ref;
      if (!groupedChunks[baseRef]) {
        groupedChunks[baseRef] = [];
      }
      groupedChunks[baseRef].push(chunk);
    });
    
    let updatedCount = 0;
    let failedCount = 0;
    const baseRefs = Object.keys(groupedChunks);
    
    console.log(`🔍 Processing ${baseRefs.length} base references...`);
    
    for (const baseRef of baseRefs) {
      try {
        console.log(`  📖 Fetching Hebrew for ${baseRef}...`);
        
        // Fetch Hebrew text for this base reference
        const hebrewResult = await getHebrewText(baseRef);
        
        if (!hebrewResult || !hebrewResult.hebrew) {
          console.warn(`  ⚠️  No Hebrew found for ${baseRef}`);
          failedCount += groupedChunks[baseRef].length;
          continue;
        }
        
        console.log(`  ✅ Hebrew fetched (${hebrewResult.hebrew.length} chars)`);
        
        // Get chunks for this base reference
        const refChunks = groupedChunks[baseRef];
        const targetChunkCount = refChunks.length;
        
        // Chunk the Hebrew text to match English chunks
        const hebrewChunks = chunkHebrewText(hebrewResult.hebrew, targetChunkCount);
        
        console.log(`  ⚙️  Created ${hebrewChunks.length} Hebrew chunks for ${targetChunkCount} English chunks`);
        
        // Update each chunk with corresponding Hebrew content
        for (let i = 0; i < refChunks.length; i++) {
          const chunk = refChunks[i];
          const hebrewContent = hebrewChunks[i] || '';  // Use empty string if no Hebrew chunk available
          
          try {
            await client.query(`
              UPDATE text_chunks 
              SET 
                content_hebrew = $1,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [hebrewContent, chunk.chunk_id]);
            
            updatedCount++;
          } catch (error) {
            console.warn(`    ⚠️  Failed to update chunk ${chunk.tref}:`, error.message);
            failedCount++;
          }
        }
        
        // Rate limiting - don't overwhelm Sefaria
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error) {
        console.error(`  ❌ Failed to process ${baseRef}:`, error.message);
        failedCount += groupedChunks[baseRef].length;
      }
    }
    
    console.log(`✅ ${workTitle} Hebrew processing complete:`);
    console.log(`   📝 Updated chunks: ${updatedCount}`);
    console.log(`   ❌ Failed chunks: ${failedCount}`);
    
    return { updatedCount, failedCount };
    
  } finally {
    client.release();
  }
}

/**
 * Process all three works
 */
async function addHebrewToAllWorks() {
  console.log('🚀 Adding Hebrew Content to All Ramchal Works\n');
  
  const works = ['Mesillat Yesharim', 'Derekh Hashem', 'Da\'at Tevunot'];
  
  let totalUpdated = 0;
  let totalFailed = 0;
  
  const startTime = Date.now();
  
  for (const work of works) {
    try {
      const result = await updateChunksWithHebrew(work);
      totalUpdated += result.updatedCount;
      totalFailed += result.failedCount;
      
      // Pause between works
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`💥 Failed to process ${work}:`, error.message);
    }
  }
  
  const processingTime = Date.now() - startTime;
  
  // Verify final database state
  console.log('\n📊 Verifying Hebrew content...');
  const client = await pool.connect();
  try {
    const hebrewStats = await client.query(`
      SELECT 
        w.title,
        COUNT(*) as total_chunks,
        COUNT(CASE WHEN tc.content_hebrew IS NOT NULL AND tc.content_hebrew != '' THEN 1 END) as chunks_with_hebrew,
        AVG(CHAR_LENGTH(tc.content_hebrew)) as avg_hebrew_length
      FROM works w
      JOIN text_chunks tc ON w.id = tc.work_id
      WHERE w.title IN ('Mesillat Yesharim', 'Derekh Hashem', 'Da''at Tevunot')
      GROUP BY w.title
      ORDER BY w.title
    `);
    
    console.log(`📈 Final Hebrew Content Stats:`);
    hebrewStats.rows.forEach(row => {
      console.log(`   📚 ${row.title}:`);
      console.log(`      📝 Total chunks: ${row.total_chunks}`);
      console.log(`      🔤 With Hebrew: ${row.chunks_with_hebrew} (${((row.chunks_with_hebrew / row.total_chunks) * 100).toFixed(1)}%)`);
      console.log(`      📊 Avg Hebrew length: ${parseFloat(row.avg_hebrew_length || 0).toFixed(0)} chars`);
    });
    
  } finally {
    client.release();
  }
  
  console.log(`\n🎉 HEBREW CONTENT ADDITION COMPLETE!`);
  console.log(`⏱️  Total time: ${(processingTime / 1000 / 60).toFixed(1)} minutes`);
  console.log(`📝 Total chunks updated: ${totalUpdated}`);
  console.log(`❌ Total chunks failed: ${totalFailed}`);
  
  if (totalUpdated > 0) {
    console.log(`\n🚀 Next steps:`);
    console.log(`1. Generate Hebrew embeddings: npm run generate-embeddings`);
    console.log(`2. Test bilingual search capabilities`);
    console.log(`3. Update API to handle Hebrew queries`);
  }
  
  return {
    totalUpdated,
    totalFailed,
    processingTimeMinutes: processingTime / 1000 / 60
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    await addHebrewToAllWorks();
  } catch (error) {
    console.error('💥 Hebrew processing failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Stopping Hebrew processing...');
  await pool.end();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { addHebrewToAllWorks, updateChunksWithHebrew };