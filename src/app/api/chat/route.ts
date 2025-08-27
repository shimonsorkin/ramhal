import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatDB } from '../../../../lib/chat'

const CreateChatSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  user_id: z.string().optional()
})


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const validationResult = CreateChatSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 })
    }

    const { title, user_id } = validationResult.data

    const chat = await chatDB.createChat({
      title: title || 'New Chat',
      user_id
    })

    return NextResponse.json(chat)

  } catch (error) {
    console.error('Create chat API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to create chat session'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const user_id = searchParams.get('user_id') || undefined
    const include_archived = searchParams.get('include_archived') === 'true'

    const chats = await chatDB.getChats(user_id, include_archived)

    return NextResponse.json(chats)

  } catch (error) {
    console.error('Get chats API error:', error)
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve chats'
    }, { status: 500 })
  }
}