import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { bootstrapRAG } from '../../../../../lib/rag'

const BootstrapRequestSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty').max(500, 'Question is too long'),
})

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()
    
    // Validate request schema
    const validationResult = BootstrapRequestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 })
    }

    const { question } = validationResult.data

    // Execute RAG bootstrap pipeline
    const result = await bootstrapRAG(question)

    // Return the witnesses and metadata
    return NextResponse.json({
      question: result.question,
      witnesses: result.witnesses,
      guesses: result.guesses,
      witnessCount: result.witnesses.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('RAG bootstrap error:', error)
    
    if (error instanceof Error) {
      // Handle specific RAG errors
      if (error.message.includes('Question cannot be empty')) {
        return NextResponse.json({
          error: 'Invalid Question',
          message: error.message
        }, { status: 400 })
      }
      
      // Handle Sefaria API errors
      if (error.message.includes('Sefaria API error')) {
        return NextResponse.json({
          error: 'External API Error',
          message: 'Failed to fetch text witnesses from Sefaria',
          details: error.message
        }, { status: 502 })
      }
      
      return NextResponse.json({
        error: 'Internal Server Error',
        message: error.message
      }, { status: 500 })
    }
    
    return NextResponse.json({
      error: 'Unknown server error'
    }, { status: 500 })
  }
}