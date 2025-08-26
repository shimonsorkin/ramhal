import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVersions } from '../../../../../lib/sefaria'

const VersionsQuerySchema = z.object({
  indexTitle: z.string().min(1, 'Index title is required'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Parse and validate query parameters
    const queryResult = VersionsQuerySchema.safeParse({
      indexTitle: searchParams.get('indexTitle') || '',
    })

    if (!queryResult.success) {
      return NextResponse.json({
        error: 'Invalid query parameters',
        details: queryResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 })
    }

    const { indexTitle } = queryResult.data

    // Get versions from Sefaria
    const versions = await getVersions(indexTitle)

    return NextResponse.json({
      indexTitle,
      versions,
      count: versions.length
    })

  } catch (error) {
    console.error('Versions API error:', error)
    
    if (error instanceof Error) {
      // Handle specific Sefaria API errors
      if (error.message.includes('Sefaria API error')) {
        return NextResponse.json({
          error: 'External API Error',
          message: error.message
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