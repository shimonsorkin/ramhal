import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatDB } from '../../../../../lib/chat'

const UpdateChatSchema = z.object({
  title: z.string().min(1).max(255)
})

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params
    const chatId = params.id
    const searchParams = request.nextUrl.searchParams
    const messageLimit = searchParams.get('message_limit') 
      ? parseInt(searchParams.get('message_limit')!)
      : undefined

    const { session, messages } = await chatDB.getChat(chatId, messageLimit)

    if (!session) {
      return NextResponse.json({
        error: 'Chat not found',
        message: 'The requested chat session does not exist'
      }, { status: 404 })
    }

    return NextResponse.json({
      session,
      messages
    })

  } catch (error) {
    console.error('Get chat API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve chat'
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params
    const chatId = params.id
    const body = await request.json()
    
    const validationResult = UpdateChatSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 })
    }

    const { title } = validationResult.data

    const updatedChat = await chatDB.updateChatTitle(chatId, title)

    if (!updatedChat) {
      return NextResponse.json({
        error: 'Chat not found',
        message: 'The requested chat session does not exist'
      }, { status: 404 })
    }

    return NextResponse.json(updatedChat)

  } catch (error) {
    console.error('Update chat API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to update chat'
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params
    const chatId = params.id
    
    const deleted = await chatDB.deleteChat(chatId)

    if (!deleted) {
      return NextResponse.json({
        error: 'Chat not found',
        message: 'The requested chat session does not exist'
      }, { status: 404 })
    }

    return NextResponse.json({
      message: 'Chat deleted successfully'
    })

  } catch (error) {
    console.error('Delete chat API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to delete chat'
    }, { status: 500 })
  }
}