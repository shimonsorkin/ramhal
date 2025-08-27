import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { bootstrapRAG, verifyAnswer } from '../../../../lib/rag'
import { hybridBootstrapRAG } from '../../../../lib/semantic-rag'
import { synthesiseAnswer } from '../../../../lib/llm'
import { chatDB } from '../../../../lib/chat'

const AskRequestSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty').max(500, 'Question is too long'),
  useSemanticSearch: z.boolean().optional().default(true), // Semantic search is now the default
  chatId: z.string().uuid().optional(), // Optional chat ID for multi-chat support
})

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()
    
    // Validate request schema
    const validationResult = AskRequestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 })
    }

    const { question, useSemanticSearch, chatId } = validationResult.data

    // Step 1: Bootstrap RAG to get witnesses
    console.log(`🔍 RAG Bootstrap for question: "${question}" (semantic: ${useSemanticSearch})`)
    
    let ragResult: {
      question: string;
      witnesses: Array<{tref: string; text: string; hebrew?: string}>;
      guesses: string[];
      searchMethod?: string;
    };
    let searchMethod = 'legacy';
    
    if (useSemanticSearch) {
      // Use new semantic search system
      try {
        ragResult = await hybridBootstrapRAG(question, bootstrapRAG);
        searchMethod = ragResult.searchMethod || 'semantic';
        console.log(`🎯 Using ${searchMethod} search`);
      } catch (error) {
        console.warn('Semantic search failed, falling back to legacy:', error);
        ragResult = await bootstrapRAG(question);
        searchMethod = 'legacy-fallback';
      }
    } else {
      // Use original JSON-based system
      ragResult = await bootstrapRAG(question);
    }
    
    if (ragResult.witnesses.length === 0) {
      return NextResponse.json({
        error: 'No relevant texts found',
        message: 'Could not find any Ramchal texts relevant to your question'
      }, { status: 404 })
    }

    console.log(`📚 Found ${ragResult.witnesses.length} witnesses from ${ragResult.guesses.length} guesses`)

    // Step 2: Synthesize answer using LLM
    console.log(`🤖 Generating answer using LLM...`)
    const synthesis = await synthesiseAnswer(question, ragResult.witnesses)

    console.log(`✅ Generated answer (${synthesis.tokensUsed} tokens using ${synthesis.model})`)

    // Step 3: Verify the answer for proper source citations
    console.log(`🔍 Verifying answer citations...`)
    const verification = verifyAnswer(synthesis.answer, ragResult.witnesses)
    
    console.log(`📊 Verification: ${verification.totalSentences - verification.unsourcedSentences}/${verification.totalSentences} sentences properly sourced`)

    // Save to chat if chatId provided
    if (chatId) {
      try {
        // Verify chat exists
        const { session } = await chatDB.getChat(chatId)
        if (!session) {
          return NextResponse.json({
            error: 'Chat not found',
            message: 'The specified chat session does not exist'
          }, { status: 404 })
        }

        // Save user question
        await chatDB.addMessage({
          chat_session_id: chatId,
          role: 'user',
          content: question
        })

        // Save assistant response with full context
        await chatDB.addMessage({
          chat_session_id: chatId,
          role: 'assistant',
          content: synthesis.answer,
          witnesses: ragResult.witnesses,
          verification: {
            unsourcedSentences: verification.unsourcedSentences,
            totalSentences: verification.totalSentences,
            sourcedSentences: verification.totalSentences - verification.unsourcedSentences,
            accuracy: verification.totalSentences > 0 ? 
              ((verification.totalSentences - verification.unsourcedSentences) / verification.totalSentences * 100) : 100,
            verifiedAnswer: verification.verifiedAnswer
          },
          metadata: {
            guesses: ragResult.guesses,
            witnessCount: ragResult.witnesses.length,
            tokensUsed: synthesis.tokensUsed,
            model: synthesis.model,
            searchMethod: searchMethod,
            useSemanticSearch: useSemanticSearch,
            timestamp: new Date().toISOString()
          }
        })

        // Auto-update chat title if this is the first user message
        if (session.title === 'New Chat') {
          await chatDB.updateAutoTitle(chatId, question)
        }

        console.log(`💬 Saved conversation to chat ${chatId}`)
      } catch (chatError) {
        console.error('Failed to save to chat:', chatError)
        // Don't fail the entire request if chat saving fails
      }
    }

    // Return the complete result
    return NextResponse.json({
      question: ragResult.question,
      answer: synthesis.answer,
      verifiedAnswer: verification.verifiedAnswer,
      witnesses: ragResult.witnesses,
      verification: {
        unsourcedSentences: verification.unsourcedSentences,
        totalSentences: verification.totalSentences,
        sourcedSentences: verification.totalSentences - verification.unsourcedSentences,
        accuracy: verification.totalSentences > 0 ? 
          ((verification.totalSentences - verification.unsourcedSentences) / verification.totalSentences * 100) : 100
      },
      metadata: {
        guesses: ragResult.guesses,
        witnessCount: ragResult.witnesses.length,
        tokensUsed: synthesis.tokensUsed,
        model: synthesis.model,
        searchMethod: searchMethod,
        useSemanticSearch: useSemanticSearch,
        chatId: chatId || null,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Ask API error:', error)
    
    if (error instanceof Error) {
      // Handle specific error types
      
      // RAG/Sefaria errors
      if (error.message.includes('Sefaria API error')) {
        return NextResponse.json({
          error: 'Text Retrieval Error',
          message: 'Failed to retrieve relevant texts from Sefaria'
        }, { status: 502 })
      }
      
      // Database/Semantic search errors
      if (error.message.includes('Semantic search failed') || error.message.includes('database')) {
        return NextResponse.json({
          error: 'Search Service Error',
          message: 'The search service is temporarily unavailable'
        }, { status: 503 })
      }
      
      // OpenAI API errors
      if (error.message.includes('OpenAI API key') || error.message.includes('API key')) {
        return NextResponse.json({
          error: 'LLM Service Configuration Error', 
          message: 'The language model service is not properly configured'
        }, { status: 503 })
      }
      
      if (error.message.includes('rate limit')) {
        return NextResponse.json({
          error: 'Service Temporarily Unavailable',
          message: 'Too many requests. Please try again in a few moments.'
        }, { status: 429 })
      }
      
      if (error.message.includes('quota')) {
        return NextResponse.json({
          error: 'Service Temporarily Unavailable',
          message: 'The language model service is temporarily unavailable'
        }, { status: 503 })
      }
      
      // Validation errors
      if (error.message.includes('Question cannot be empty') || 
          error.message.includes('At least one witness')) {
        return NextResponse.json({
          error: 'Invalid Request',
          message: error.message
        }, { status: 400 })
      }
      
      return NextResponse.json({
        error: 'Internal Server Error',
        message: error.message
      }, { status: 500 })
    }
    
    return NextResponse.json({
      error: 'Unknown server error',
      message: 'An unexpected error occurred'
    }, { status: 500 })
  }
}