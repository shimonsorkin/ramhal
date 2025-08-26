import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRandomText, pickPreferredVersion, getVersions, extractIndexTitle } from '../../../../../lib/sefaria'

const RandomQuerySchema = z.object({
  category: z.string().optional(),
  lang: z.enum(['en', 'he']).optional().default('en'),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Parse and validate query parameters
    const queryResult = RandomQuerySchema.safeParse({
      category: searchParams.get('category') || undefined,
      lang: searchParams.get('lang') || 'en',
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

    const { category, lang } = queryResult.data

    // Get random text from Sefaria
    const randomText = await getRandomText(category ? { category } : undefined)

    if (!randomText.ref) {
      return NextResponse.json({
        error: 'No random text returned from Sefaria API'
      }, { status: 502 })
    }

    // Auto-select preferred version for English requests
    let selectedVersion: string | undefined
    
    if (lang === 'en' && (!randomText.text || randomText.text.length === 0)) {
      try {
        // Extract the index title from the reference to get versions
        const indexTitle = extractIndexTitle(randomText.ref)
        console.log(`🔍 Auto-selecting version for "${indexTitle}"`)
        
        const versions = await getVersions(indexTitle)
        const preferredVersion = pickPreferredVersion(versions, lang)
        
        if (preferredVersion) {
          selectedVersion = preferredVersion.versionTitle
          console.log(`✅ Selected preferred version: "${selectedVersion}"`)
          
          // Re-fetch with specific version - but this is a random endpoint, 
          // so we'll just note the preferred version for display
        }
      } catch (versionError) {
        // Continue without version selection if it fails
        console.warn('Failed to auto-select version for random text:', versionError)
      }
    }

    // Determine which text to return based on language preference
    const textContent = lang === 'he' ? randomText.he : randomText.text
    const actualLang = textContent ? lang : (randomText.he ? 'he' : 'en')
    const finalText = textContent || randomText.he || randomText.text

    if (!finalText) {
      return NextResponse.json({
        error: 'No text content available',
        message: `No text found for reference: ${randomText.ref}`
      }, { status: 404 })
    }

    // Build response
    const response = {
      ref: randomText.ref,
      text: finalText,
      lang: actualLang,
      versionUsed: selectedVersion || 'Default Version',
      isRandom: true,
      category: category || 'All Categories'
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Sefaria random API error:', error)
    
    if (error instanceof Error) {
      // Check for specific Sefaria API errors
      if (error.message.includes('Sefaria random API error')) {
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