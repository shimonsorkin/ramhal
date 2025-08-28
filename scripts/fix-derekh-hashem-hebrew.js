/**
 * Fix Hebrew coverage for Derekh Hashem
 * Improved chunking algorithm to ensure 1:1 mapping with English chunks
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
  const apiRef = encodeURIComponent(tref);
  const params = new URLSearchParams();
  params.set('lang', 'he');

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
 * IMPROVED Hebrew chunking algorithm - ensures exactly targetChunkCount chunks
 */
function improvedChunkHebrewText(hebrewText, targetChunkCount, maxLength = 600) {
  if (!hebrewText || hebrewText.trim().length === 0) {
    // Return empty chunks to match target count
    return Array(targetChunkCount).fill('');
  }
  
  const cleanText = hebrewText.trim();
  
  if (targetChunkCount === 1) {
    return [cleanText.substring(0, maxLength)];
  }
  
  // Calculate target length per chunk
  const avgChunkLength = Math.ceil(cleanText.length / targetChunkCount);
  
  // Split by Hebrew sentence delimiters
  const sentences = cleanText.split(/[\.!?׃:]+/).filter(s => s.trim());
  
  if (sentences.length === 0) {
    // If no sentences, split by character length
    const chunks = [];
    for (let i = 0; i < targetChunkCount; i++) {
      const start = Math.floor((i * cleanText.length) / targetChunkCount);
      const end = Math.floor(((i + 1) * cleanText.length) / targetChunkCount);
      const chunk = cleanText.substring(start, end).trim();
      chunks.push(chunk || '');
    }
    return chunks;
  }
  
  // Distribute sentences across target chunks
  const chunks = Array(targetChunkCount).fill('').map(() => []);
  
  // Assign sentences to chunks using round-robin with length balancing
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;
    
    // Find the chunk with the shortest current content
    let minLength = Infinity;
    let targetChunkIndex = 0;
    
    for (let j = 0; j < chunks.length; j++) {
      const currentLength = chunks[j].join(' ').length;
      if (currentLength < minLength) {
        minLength = currentLength;
        targetChunkIndex = j;
      }
    }
    
    chunks[targetChunkIndex].push(sentence);
  }
  
  // Convert arrays back to strings and ensure max length
  const result = chunks.map(chunkArray => {
    const chunkText = chunkArray.join('. ').trim();
    return chunkText.length > maxLength ? 
      chunkText.substring(0, maxLength).trim() : 
      chunkText;
  });
  
  // Ensure we have exactly targetChunkCount chunks (fill empty if needed)
  while (result.length < targetChunkCount) {
    result.push('');
  }
  
  return result.slice(0, targetChunkCount);
}

/**
 * Fix Hebrew coverage for specific problematic sections
 */
async function fixDerekHachemHebrew() {
  console.log('🚀 Fixing Hebrew Coverage for Derekh Hashem\n');
  
  const client = await pool.connect();
  try {
    // Get all Derekh Hashem sections that have missing Hebrew
    const sectionsResult = await client.query(`
      SELECT 
        SPLIT_PART(tc.tref, ':', 1) as base_ref,
        COUNT(*) as total_chunks,
        COUNT(CASE WHEN tc.content_hebrew IS NOT NULL AND tc.content_hebrew != '' THEN 1 END) as chunks_with_hebrew,
        COUNT(CASE WHEN tc.content_hebrew IS NULL OR tc.content_hebrew = '' THEN 1 END) as chunks_missing_hebrew
      FROM works w
      JOIN text_chunks tc ON w.id = tc.work_id
      WHERE w.title = 'Derekh Hashem'
      GROUP BY SPLIT_PART(tc.tref, ':', 1)
      HAVING COUNT(CASE WHEN tc.content_hebrew IS NULL OR tc.content_hebrew = '' THEN 1 END) > 0
      ORDER BY chunks_missing_hebrew DESC
    `);
    
    const problematicSections = sectionsResult.rows;
    console.log(`🔍 Found ${problematicSections.length} sections with incomplete Hebrew coverage`);
    
    let totalFixed = 0;
    let totalFailed = 0;
    
    for (const section of problematicSections) {
      const baseRef = section.base_ref;
      const totalChunks = parseInt(section.total_chunks);
      const missingChunks = parseInt(section.chunks_missing_hebrew);
      
      console.log(`\n📖 Processing ${baseRef}...`);
      console.log(`  📊 Total chunks: ${totalChunks}, Missing Hebrew: ${missingChunks}`);
      
      try {
        // Fetch Hebrew text for this section
        console.log(`  🌐 Fetching Hebrew from Sefaria...`);
        const hebrewResult = await getHebrewText(baseRef);
        
        if (!hebrewResult || !hebrewResult.hebrew) {
          console.warn(`  ⚠️  No Hebrew found for ${baseRef}`);
          totalFailed += missingChunks;
          continue;
        }
        
        console.log(`  ✅ Hebrew fetched (${hebrewResult.hebrew.length} chars)`);
        
        // Get all chunks for this section in order
        const chunksResult = await client.query(`
          SELECT tc.id, tc.tref
          FROM works w
          JOIN text_chunks tc ON w.id = tc.work_id
          WHERE w.title = 'Derekh Hashem'
            AND tc.tref LIKE $1
          ORDER BY tc.tref
        `, [`${baseRef}:%`]);
        
        const allChunks = chunksResult.rows;
        console.log(`  📝 Processing ${allChunks.length} chunks`);
        
        // Create improved Hebrew chunks
        const hebrewChunks = improvedChunkHebrewText(hebrewResult.hebrew, totalChunks);
        console.log(`  ⚙️  Created ${hebrewChunks.length} Hebrew chunks`);
        
        // Update each chunk with its corresponding Hebrew content
        let sectionFixed = 0;
        let sectionFailed = 0;
        
        for (let i = 0; i < allChunks.length; i++) {
          const chunk = allChunks[i];
          const hebrewContent = hebrewChunks[i] || '';
          
          try {
            await client.query(`
              UPDATE text_chunks 
              SET 
                content_hebrew = $1,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [hebrewContent, chunk.id]);
            
            sectionFixed++;
            
          } catch (error) {
            console.warn(`    ⚠️  Failed to update ${chunk.tref}:`, error.message);
            sectionFailed++;
          }
        }
        
        console.log(`  ✅ Section complete: ${sectionFixed} fixed, ${sectionFailed} failed`);
        totalFixed += sectionFixed;
        totalFailed += sectionFailed;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`  ❌ Failed to process ${baseRef}:`, error.message);
        totalFailed += missingChunks;
      }
    }
    
    // Final verification
    console.log('\n📊 Verifying Derekh Hashem Hebrew coverage...');
    const finalStats = await client.query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(CASE WHEN tc.content_hebrew IS NOT NULL AND tc.content_hebrew != '' THEN 1 END) as chunks_with_hebrew,
        ROUND(COUNT(CASE WHEN tc.content_hebrew IS NOT NULL AND tc.content_hebrew != '' THEN 1 END) * 100.0 / COUNT(*), 1) as coverage_percent
      FROM works w
      JOIN text_chunks tc ON w.id = tc.work_id
      WHERE w.title = 'Derekh Hashem'
    `);
    
    const stats = finalStats.rows[0];
    console.log(`📈 Final Derekh Hashem Hebrew Stats:`);
    console.log(`   📝 Total chunks: ${stats.total_chunks}`);
    console.log(`   🔤 With Hebrew: ${stats.chunks_with_hebrew} (${stats.coverage_percent}%)`);
    
    console.log(`\n🎉 DEREKH HASHEM HEBREW FIX COMPLETE!`);
    console.log(`✅ Fixed chunks: ${totalFixed}`);
    console.log(`❌ Failed chunks: ${totalFailed}`);
    
    return {
      totalFixed,
      totalFailed,
      finalCoverage: parseFloat(stats.coverage_percent)
    };
    
  } finally {
    client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const result = await fixDerekHachemHebrew();
    
    if (result.finalCoverage >= 99.0) {
      console.log('\n🎊 SUCCESS: Derekh Hashem Hebrew coverage is now complete!');
    } else {
      console.log(`\n⚠️  Coverage improved to ${result.finalCoverage}% but some gaps remain.`);
    }
    
  } catch (error) {
    console.error('💥 Hebrew fix failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Stopping Hebrew fix...');
  await pool.end();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { fixDerekHachemHebrew, improvedChunkHebrewText };