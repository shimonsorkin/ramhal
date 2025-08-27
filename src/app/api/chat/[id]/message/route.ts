import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatDB } from '../../../../../../lib/chat'

const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  witnesses: z.array(z.any()).optional(),
  verification: z.any().optional(),
  metadata: z.any().optional()
})

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params
    const chatId = params.id
    const body = await request.json()
    
    const validationResult = AddMessageSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 })
    }

    const { role, content, witnesses, verification, metadata } = validationResult.data

    // Verify chat exists first
    const { session } = await chatDB.getChat(chatId)
    if (!session) {
      return NextResponse.json({
        error: 'Chat not found',
        message: 'The requested chat session does not exist'
      }, { status: 404 })
    }

    const message = await chatDB.addMessage({
      chat_session_id: chatId,
      role,
      content,
      witnesses,
      verification,
      metadata
    })

    // If this is the first user message and chat title is still "New Chat", update it
    if (role === 'user' && session.title === 'New Chat') {
      await chatDB.updateAutoTitle(chatId, content)
    }

    return NextResponse.json(message)

  } catch (error) {
    console.error('Add message API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to add message'
    }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params
    const chatId = params.id
    const searchParams = request.nextUrl.searchParams
    
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    const order = searchParams.get('order') === 'desc' ? 'desc' : 'asc'

    const messages = await chatDB.getMessages(chatId, limit, offset, order)

    return NextResponse.json(messages)

  } catch (error) {
    console.error('Get messages API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve messages'
    }, { status: 500 })
  }
}