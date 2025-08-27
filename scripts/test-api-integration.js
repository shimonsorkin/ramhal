/**
 * Test the integrated API with both legacy and semantic search
 * Compares results between old and new systems
 */

require('dotenv').config({ path: '.env.local' });

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * Test the API endpoint with different search methods
 */
async function testAPI(question, useSemanticSearch = false) {
  const url = 'http://localhost:3000/api/ask';
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing: "${question}"`);
  console.log(`🎯 Search Method: ${useSemanticSearch ? 'Semantic' : 'Legacy JSON'}`);
  console.log(`${'='.repeat(80)}`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        useSemanticSearch
      })
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorData = await response.json();
      console.log(`❌ API Error (${response.status}): ${errorData.error}`);
      console.log(`   Message: ${errorData.message}`);
      return null;
    }
    
    const data = await response.json();
    
    console.log(`✅ Response received in ${responseTime}ms`);
    console.log(`📊 Metadata:`);
    console.log(`   Search Method: ${data.metadata.searchMethod || 'legacy'}`);
    console.log(`   Witnesses Found: ${data.metadata.witnessCount}`);
    console.log(`   Tokens Used: ${data.metadata.tokensUsed}`);
    console.log(`   Model: ${data.metadata.model}`);
    
    console.log(`\n📚 Witnesses Found:`);
    data.witnesses.forEach((witness, i) => {
      console.log(`${i + 1}. ${witness.tref}`);
      console.log(`   Content: ${witness.text.substring(0, 120)}...`);
    });
    
    console.log(`\n🤖 Generated Answer:`);
    console.log(`${data.answer.substring(0, 300)}...`);
    
    console.log(`\n📊 Verification:`);
    console.log(`   Sourced sentences: ${data.verification.sourcedSentences}/${data.verification.totalSentences}`);
    console.log(`   Accuracy: ${data.verification.accuracy.toFixed(1)}%`);
    
    return data;
    
  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
    return null;
  }
}

/**
 * Compare legacy vs semantic search results
 */
async function compareSearchMethods(question) {
  console.log(`\n${'#'.repeat(100)}`);
  console.log(`🔬 COMPARATIVE ANALYSIS: "${question}"`);
  console.log(`${'#'.repeat(100)}`);
  
  // Test legacy system
  const legacyResult = await testAPI(question, false);
  
  // Test semantic system  
  const semanticResult = await testAPI(question, true);
  
  // Compare results
  if (legacyResult && semanticResult) {
    console.log(`\n📊 COMPARISON SUMMARY:`);
    console.log(`${'─'.repeat(50)}`);
    
    console.log(`Legacy System:`);
    console.log(`  ✅ Witnesses: ${legacyResult.metadata.witnessCount}`);
    console.log(`  📝 Answer length: ${legacyResult.answer.length} chars`);
    console.log(`  🎯 Accuracy: ${legacyResult.verification.accuracy.toFixed(1)}%`);
    
    console.log(`Semantic System:`);
    console.log(`  ✅ Witnesses: ${semanticResult.metadata.witnessCount}`);
    console.log(`  📝 Answer length: ${semanticResult.answer.length} chars`);
    console.log(`  🎯 Accuracy: ${semanticResult.verification.accuracy.toFixed(1)}%`);
    console.log(`  🔍 Search method: ${semanticResult.metadata.searchMethod}`);
    
    // Determine winner
    const legacyScore = legacyResult.metadata.witnessCount + (legacyResult.verification.accuracy / 100);
    const semanticScore = semanticResult.metadata.witnessCount + (semanticResult.verification.accuracy / 100);
    
    if (semanticScore > legacyScore) {
      console.log(`\n🏆 Winner: Semantic Search (better results)`);
    } else if (legacyScore > semanticScore) {
      console.log(`\n🏆 Winner: Legacy Search (better results)`);
    } else {
      console.log(`\n🤝 Tie: Both systems performed similarly`);
    }
  }
  
  return { legacyResult, semanticResult };
}

/**
 * Main test function
 */
async function runIntegrationTests() {
  console.log('🚀 Starting API Integration Tests\n');
  console.log('💡 Make sure the development server is running: npm run dev');
  
  // Wait a bit to make sure user sees the message
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test queries - especially the ones that failed before
  const testQueries = [
    "What does Ramhal say about evil?", // The main problem we're solving
    "What is the purpose of creation?",   // Should work well with both systems
    "How should one serve God?",          // General spiritual question
    "Why do the righteous suffer?"       // Theological question
  ];
  
  console.log(`\n📋 Running ${testQueries.length} comparative tests...\n`);
  
  const results = [];
  
  for (const query of testQueries) {
    const comparison = await compareSearchMethods(query);
    results.push(comparison);
    
    // Pause between tests to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Final summary
  console.log(`\n${'🎉'.repeat(20)}`);
  console.log('🎉 INTEGRATION TESTS COMPLETE!');
  console.log(`${'🎉'.repeat(20)}`);
  
  let semanticWins = 0;
  let legacyWins = 0;
  let ties = 0;
  
  results.forEach((result, i) => {
    if (!result.legacyResult || !result.semanticResult) return;
    
    const legacyScore = result.legacyResult.metadata.witnessCount;
    const semanticScore = result.semanticResult.metadata.witnessCount;
    
    if (semanticScore > legacyScore) {
      semanticWins++;
    } else if (legacyScore > semanticScore) {
      legacyWins++;
    } else {
      ties++;
    }
  });
  
  console.log(`\n📊 FINAL SCOREBOARD:`);
  console.log(`🎯 Semantic Search wins: ${semanticWins}`);
  console.log(`📚 Legacy Search wins: ${legacyWins}`);
  console.log(`🤝 Ties: ${ties}`);
  
  if (semanticWins > legacyWins) {
    console.log(`\n🏆 Semantic Search is the clear winner!`);
    console.log(`✨ Ready for production deployment!`);
  } else if (legacyWins > semanticWins) {
    console.log(`\n🤔 Legacy system still performs better on some queries`);
    console.log(`💡 Consider tuning semantic search parameters`);
  } else {
    console.log(`\n⚖️  Both systems perform similarly`);
    console.log(`🚀 Semantic search is ready for gradual rollout`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Stopping tests...');
  process.exit(0);
});

// Check if server is likely running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'test' })
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ Development server not running!');
    console.log('💡 Please start it first: npm run dev');
    console.log('   Then wait for "Ready" message and try again.');
    process.exit(1);
  }
  
  await runIntegrationTests();
}

main().catch(console.error);