# Semantic Search Scripts

These scripts help you generate embeddings and test the semantic search functionality.

## Prerequisites

1. **OpenAI API Key**: Add your API key to `.env.local`:
   ```bash
   OPENAI_API_KEY="sk-your-actual-openai-api-key-here"
   ```
   
2. **Database**: PostgreSQL with existing text chunks (already done if you ran Phase 1)

## Scripts

### 1. Generate Embeddings

**Purpose**: Creates vector embeddings for all text chunks that don't have them yet.

**Command**:
```bash
npm run generate-embeddings
```

**What it does**:
- ✅ Tests your OpenAI API connection
- 📊 Finds all text chunks without embeddings  
- 🤖 Generates 1536-dimensional embeddings using `text-embedding-3-small`
- 💾 Stores embeddings in the database
- 📈 Shows progress and final statistics

**Expected output**:
```
🧪 Testing embedding generation...
✅ Test successful!
📊 Generated embedding with 1536 dimensions

🚀 Starting embedding generation for existing chunks
📊 Found 4 chunks without embeddings

📋 Chunks to process:
1. Mesillat Yesharim - Mesillat Yesharim 1:1
2. Derekh Hashem - Derekh Hashem, Part One, On the Purpose of Creation:1
...

✅ Updated chunk 1: Mesillat Yesharim 1:1
✅ Updated chunk 2: Derekh Hashem, Part One, On the Purpose of Creation:1
...

🎉 Embedding generation complete!
📊 Successfully processed 4/4 chunks
🎯 All chunks now have embeddings! Ready for semantic search.
```

### 2. Test Semantic Search

**Purpose**: Tests different search methods with sample queries to verify everything works.

**Command**:
```bash
npm run test-semantic-search
```

**What it does**:
- 🔍 Tests vector similarity search (finds conceptually similar content)
- 📝 Tests full-text search (finds exact keyword matches)  
- 🔄 Tests hybrid search (combines both methods)
- 🧪 Runs multiple test queries including "What does Ramhal say about evil?"

**Expected output**:
```
🚀 Testing Semantic Search System

📊 Database Status:
   Total chunks: 4
   With embeddings: 4
✅ Ready for semantic search!

============================================================
🔍 Testing Query: "What does Ramhal say about evil?"
============================================================

🎯 Vector Search Results:

1. Da'at Tevunot - Da'at Tevunot 1:1 (87.3% similar)
   Content: The question of suffering and divine justice in the world...

2. Derekh Hashem - Derekh Hashem, Part One, On the Purpose of Creation:1 (82.1% similar)  
   Content: The purpose of creation was to give from His goodness...

📝 Full-Text Search Results:
❌ No results found

🔄 Hybrid Search Results (Best Overall):

1. 🧠 Da'at Tevunot - Da'at Tevunot 1:1 (87.3%)
   Content: The question of suffering and divine justice...

2. 🧠 Derekh Hashem - Derekh Hashem, Part One, On the Purpose of Creation:1 (82.1%)
   Content: The purpose of creation was to give from His goodness...
```

## Understanding the Results

### Search Types
- **🧠 Vector Search**: Uses AI embeddings to find conceptually similar content
- **📝 Full-Text Search**: Traditional keyword matching
- **🎯 Hybrid Search**: Combines both methods, boosting results found by both

### Why This Is Better Than the Old System

**Old JSON-based system**:
- Query: "What does Ramhal say about evil?"
- Result: ❌ "No relevant texts found"

**New semantic search system**:
- Query: "What does Ramhal say about evil?"  
- Result: ✅ Finds relevant passages about theodicy, divine justice, suffering from Da'at Tevunot and Derekh Hashem

The AI understands that "evil" is conceptually related to "suffering", "divine justice", "theodicy" even if those exact words aren't used.

## Troubleshooting

### ❌ "Please add your OpenAI API key"
- Get your API key from https://platform.openai.com/api-keys
- Add it to `.env.local` as `OPENAI_API_KEY="sk-..."`

### ❌ "No embeddings found"
- Run `npm run generate-embeddings` first
- Make sure it completes successfully

### ❌ "Database connection failed"  
- Make sure PostgreSQL is running: `brew services start postgresql@17`
- Check your DATABASE_URL in `.env.local`

### ❌ Rate limit errors
- The script automatically handles rate limits and retries
- If you hit daily limits, wait and try again later

## Next Steps

Once both scripts run successfully:

1. **Test with your own queries** by modifying `test-semantic-search.js`
2. **Add more Ramchal texts** by running the preprocessing pipeline
3. **Integrate with your existing RAG API** to replace the JSON-based system
4. **Scale to thousands of texts** using the same process

The foundation is now complete and ready for production! 🚀