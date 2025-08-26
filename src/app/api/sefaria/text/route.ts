import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getTextV3, getVersions, pickPreferredVersion, extractIndexTitle } from '../../../../../lib/sefaria'

const QuerySchema = z.object({
  tref: z.string().min(1, 'tref is required'),
  lang: z.enum(['en', 'he']).default('en'),
  version: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    // Handle null values from searchParams.get()
    const tref = searchParams.get('tref')
    const lang = searchParams.get('lang') || 'en'
    const version = searchParams.get('version') || undefined
    
    if (!tref) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: [{ field: 'tref', message: 'tref is required' }],
        },
        { status: 400 }
      )
    }
    
    const queryParams = {
      tref,
      lang: lang as 'en' | 'he',
      version,
    }

    const validatedQuery = QuerySchema.parse(queryParams)

    let finalVersion = validatedQuery.version
    
    // If no version specified, try to auto-select a preferred English version
    if (!finalVersion && validatedQuery.lang === 'en') {
      try {
        // First, get a basic result to determine the actual ref format
        const tempResult = await getTextV3(validatedQuery.tref, {
          lang: validatedQuery.lang,
        })
        
        // Extract the index title from the returned ref
        const indexTitle = extractIndexTitle(tempResult.ref)
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Auto-selecting version for "${indexTitle}"`)
        }
        
        // Get available versions and pick the preferred one
        const versions = await getVersions(indexTitle)
        const preferred = pickPreferredVersion(versions, validatedQuery.lang)
        
        if (preferred) {
          finalVersion = preferred.versionTitle
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Selected preferred version: "${finalVersion}"`)
          }
        }
      } catch (error) {
        // If version selection fails, continue without a specific version
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠️ Failed to auto-select version, using default:`, error instanceof Error ? error.message : 'Unknown error')
        }
      }
    }

    const result = await getTextV3(validatedQuery.tref, {
      lang: validatedQuery.lang,
      version: finalVersion,
    })

    const textContent = validatedQuery.lang === 'he' ? result.he : result.text
    const versionUsed = finalVersion || 
                       result.versions?.find(v => v.language === validatedQuery.lang)?.versionTitle || 
                       result.versions?.[0]?.versionTitle || 'default'

    return NextResponse.json({
      ref: result.ref,
      text: textContent,
      lang: validatedQuery.lang,
      versionUsed,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      )
    }

    if (error instanceof Error) {
      if (error.message.includes('Sefaria API error: 404')) {
        return NextResponse.json(
          {
            error: 'Text reference not found',
            message: 'The specified text reference does not exist',
          },
          { status: 404 }
        )
      }

      if (error.message.includes('Could not find title in reference')) {
        return NextResponse.json(
          {
            error: 'Text reference not found',
            message: 'The specified text reference does not exist in Sefaria. Try "Genesis 1:1" or check the exact title.',
          },
          { status: 404 }
        )
      }

      if (error.message.includes('Sefaria API error:')) {
        return NextResponse.json(
          {
            error: 'External API error',
            message: error.message,
          },
          { status: 502 }
        )
      }

      if (error.message.includes('Invalid response format')) {
        return NextResponse.json(
          {
            error: 'Data validation error',
            message: 'Received unexpected data format from external API',
          },
          { status: 502 }
        )
      }
    }

    console.error('Unexpected error in /api/sefaria/text:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}