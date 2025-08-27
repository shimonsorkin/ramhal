-- PostgreSQL + pgvector schema for scalable text search
-- Supports both vector similarity and full-text search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text matching

-- Authors/Scholars table
CREATE TABLE authors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hebrew_name VARCHAR(255),
    birth_year INTEGER,
    death_year INTEGER,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Works/Books table  
CREATE TABLE works (
    id SERIAL PRIMARY KEY,
    author_id INTEGER REFERENCES authors(id),
    title VARCHAR(500) NOT NULL,
    hebrew_title VARCHAR(500),
    alternative_titles TEXT[], -- Array of alternative names
    description TEXT,
    original_language VARCHAR(10) DEFAULT 'he', -- he, en, ar, etc.
    structure_type VARCHAR(50), -- simple_chapters, complex_parts, continuous, etc.
    sefaria_index_title VARCHAR(500), -- For Sefaria API integration
    total_chapters INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Text chunks table - core of the search system
CREATE TABLE text_chunks (
    id SERIAL PRIMARY KEY,
    work_id INTEGER REFERENCES works(id),
    
    -- Hierarchical structure
    part_number INTEGER, -- For complex works with parts
    chapter_number INTEGER,
    section_number INTEGER,
    paragraph_number INTEGER,
    
    -- References
    tref VARCHAR(1000) NOT NULL, -- Sefaria reference like "Derekh Hashem, Part One, On Mankind"
    canonical_ref VARCHAR(1000), -- Standardized reference
    
    -- Content
    content_hebrew TEXT,
    content_english TEXT, 
    content_transliteration TEXT,
    
    -- Chunk metadata
    chunk_type VARCHAR(50) DEFAULT 'paragraph', -- paragraph, section, chapter, footnote
    word_count INTEGER,
    character_count INTEGER,
    
    -- Vector embeddings (1536 dimensions for OpenAI text-embedding-3-small)
    embedding_hebrew vector(1536),
    embedding_english vector(1536),
    
    -- Full-text search vectors
    search_vector_hebrew tsvector,
    search_vector_english tsvector,
    
    -- Relevance scoring helpers
    topic_keywords TEXT[], -- Extracted key terms
    sentiment_score REAL, -- For filtering positive/negative content
    complexity_score REAL, -- Reading difficulty
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Search queries log (for improving results over time)
CREATE TABLE search_queries (
    id SERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    query_language VARCHAR(10) DEFAULT 'en',
    user_id VARCHAR(255), -- Optional user tracking
    results_count INTEGER,
    clicked_chunk_ids INTEGER[], -- Which results user clicked
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Search results cache (for performance)
CREATE TABLE search_cache (
    id SERIAL PRIMARY KEY,
    query_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256 of normalized query
    query_text TEXT NOT NULL,
    chunk_ids INTEGER[], -- Ordered array of result chunk IDs
    scores REAL[], -- Corresponding similarity scores
    search_type VARCHAR(50), -- vector, fulltext, hybrid
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
-- Vector similarity indexes (HNSW for fast approximate nearest neighbor)
CREATE INDEX idx_text_chunks_embedding_hebrew ON text_chunks 
    USING hnsw (embedding_hebrew vector_cosine_ops) 
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_text_chunks_embedding_english ON text_chunks 
    USING hnsw (embedding_english vector_cosine_ops) 
    WITH (m = 16, ef_construction = 64);

-- Full-text search indexes
CREATE INDEX idx_text_chunks_search_hebrew ON text_chunks 
    USING gin(search_vector_hebrew);

CREATE INDEX idx_text_chunks_search_english ON text_chunks 
    USING gin(search_vector_english);

-- Structural indexes
CREATE INDEX idx_text_chunks_work_id ON text_chunks(work_id);
CREATE INDEX idx_text_chunks_tref ON text_chunks(tref);
CREATE INDEX idx_text_chunks_chapter ON text_chunks(work_id, chapter_number);

-- Trigram indexes for fuzzy matching
CREATE INDEX idx_works_title_trgm ON works USING gin (title gin_trgm_ops);
CREATE INDEX idx_authors_name_trgm ON authors USING gin (name gin_trgm_ops);

-- Update triggers for search vectors
CREATE OR REPLACE FUNCTION update_search_vectors()
RETURNS TRIGGER AS $$
BEGIN
    -- Update Hebrew search vector
    IF NEW.content_hebrew IS NOT NULL THEN
        NEW.search_vector_hebrew := to_tsvector('hebrew', NEW.content_hebrew);
    END IF;
    
    -- Update English search vector  
    IF NEW.content_english IS NOT NULL THEN
        NEW.search_vector_english := to_tsvector('english', NEW.content_english);
    END IF;
    
    -- Update word counts
    IF NEW.content_english IS NOT NULL THEN
        NEW.word_count := array_length(string_to_array(NEW.content_english, ' '), 1);
        NEW.character_count := length(NEW.content_english);
    END IF;
    
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_search_vectors
    BEFORE INSERT OR UPDATE ON text_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_search_vectors();

-- Initial data: Insert Ramchal
INSERT INTO authors (name, hebrew_name, birth_year, death_year, bio) VALUES 
('Rabbi Moshe Chaim Luzzatto', 'רבי משה חיים לוצאטו', 1707, 1746, 
 'Known as the Ramchal, Italian rabbi, kabbalist, and ethicist. Author of Mesillat Yesharim and Derekh Hashem.');

-- Sample works
INSERT INTO works (author_id, title, hebrew_title, alternative_titles, description, sefaria_index_title) VALUES 
(1, 'Mesillat Yesharim', 'מסילת ישרים', ARRAY['Mesilat Yesharim', 'Path of the Just'], 
 'Guide to ethical and spiritual perfection', 'Mesillat Yesharim'),
(1, 'Derekh Hashem', 'דרך השם', ARRAY['Derech Hashem', 'The Way of God'], 
 'Systematic exposition of Jewish theology and philosophy', 'Derekh Hashem'),
(1, 'Da''at Tevunot', 'דעת תבונות', ARRAY['Daat Tevunot', 'Knowledge of Understanding'], 
 'Dialogue on divine providence and theodicy', 'Da''at Tevunot');

-- Chat system tables for multi-conversation support
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(255), -- For future user authentication
    is_archived BOOLEAN DEFAULT false
);

-- Messages table for chat history
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    
    -- For assistant messages, store the full response data
    witnesses JSONB, -- Array of witness objects
    verification JSONB, -- Verification scores and data
    metadata JSONB, -- Model info, tokens, etc.
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message_order INTEGER NOT NULL -- For preserving order
);

-- Indexes for chat system performance
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(chat_session_id);
CREATE INDEX idx_chat_messages_order ON chat_messages(chat_session_id, message_order);

-- Trigger to update chat session timestamp when messages are added
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_sessions 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.chat_session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_session_timestamp
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_session_timestamp();