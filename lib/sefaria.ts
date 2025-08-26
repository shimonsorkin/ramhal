import { z } from 'zod'
import { sefariaCache, createCacheKey, CACHE_TTL } from './cache'

const SefariaTextResponseSchema = z.union([
  z.object({
    ref: z.string(),
    text: z.union([z.string(), z.array(z.string())]).optional(),
    he: z.union([z.string(), z.array(z.string())]).optional(),
    versions: z.array(z.any()).optional(),
  }),
  z.object({
    error: z.string(),
  })
])

const SefariaVersionsResponseSchema = z.object({
  versions: z.array(z.object({
    versionTitle: z.string(),
    language: z.string(),
    priority: z.union([z.number(), z.string()]).optional().transform(val => {
      if (typeof val === 'string') {
        const num = parseFloat(val)
        return isNaN(num) ? undefined : num
      }
      return val
    }),
    versionSource: z.string().optional(),
    versionNotes: z.string().optional(),
  }))
})

export interface GetTextV3Options {
  version?: string
  lang?: 'he' | 'en'
}

export interface SefariaVersion {
  versionTitle: string
  language: string
  priority?: number
  versionSource?: string
  versionNotes?: string
}

export interface SefariaTextResult {
  ref: string
  text?: string
  he?: string
  versions?: Array<{ versionTitle: string; language: string }>
}

export async function getTextV3(
  tref: string,
  opts: GetTextV3Options = {}
): Promise<SefariaTextResult> {
  const { version, lang = 'en' } = opts

  // Convert tref format for v2 API 
  // For most texts: Genesis 1:1 -> Genesis.1.1
  // For Ramchal titles: keep as URL-encoded since they have special characters and spaces
  let apiRef: string
  const ramchalTitles = [
    'Mesillat Yesharim', 'Mesilat Yesharim',
    'Da\'at Tevunot', 'Daat Tevunot',
    'Asarah Perakim LeRamchal',
    'Derech Etz Chayim (Ramchal)',
    'Kalach Pitchei Chokhmah',
    'Essay on Fundamentals',
    'Sefer HaHiggayon',
    'Sefer HaMelitzah',
    'Derekh Hashem'
  ]
  
  const isRamchalText = ramchalTitles.some(title => tref.includes(title))
  
  if (isRamchalText) {
    // Ramchal texts need URL encoding, not dot notation
    apiRef = encodeURIComponent(tref)
  } else {
    // Standard format: convert spaces and colons to dots
    apiRef = tref.replace(/\s+/g, '.').replace(/:/g, '.')
  }
  
  const params = new URLSearchParams()
  if (version) params.set('version', version)
  
  // Use 'bi' for bilingual to get both languages
  if (lang === 'he') {
    params.set('lang', 'he')
  } else {
    params.set('lang', 'bi')
  }

  const queryString = params.toString()
  const url = `https://www.sefaria.org/api/texts/${apiRef}${queryString ? `?${queryString}` : ''}`

  // Check cache first
  const cacheKey = createCacheKey(url)
  const cachedResult = sefariaCache.get(cacheKey) as SefariaTextResult | null
  
  if (cachedResult) {
    return cachedResult
  }

  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Sefaria API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    const parsedData = SefariaTextResponseSchema.parse(data)
    
    // Check if it's an error response
    if ('error' in parsedData) {
      throw new Error(`Sefaria API error: ${parsedData.error}`)
    }
    
    // Helper function to extract text from array or string
    const extractText = (textData: string | string[] | undefined): string | undefined => {
      if (!textData) return undefined
      return Array.isArray(textData) ? textData[0] : textData
    }
    
    // Build result
    const result: SefariaTextResult = {
      ref: parsedData.ref,
      versions: parsedData.versions || []
    }
    
    if (lang === 'he') {
      result.he = extractText(parsedData.he)
    } else {
      result.text = extractText(parsedData.text)
      result.he = extractText(parsedData.he)
    }
    
    // Cache the successful result
    sefariaCache.set(cacheKey, result, CACHE_TTL.TEN_MINUTES)
    
    return result
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid response format from Sefaria API: ${error.message}`)
    }
    
    if (error instanceof Error) {
      throw error
    }
    
    throw new Error('Unknown error occurred while fetching from Sefaria API')
  }
}

// Get available versions for a text
export async function getVersions(indexTitle: string): Promise<SefariaVersion[]> {
  const versionsCacheKey = `versions:${indexTitle}`
  const cachedVersions = sefariaCache.get(versionsCacheKey) as SefariaVersion[] | null
  
  if (cachedVersions) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 Versions cache HIT: ${indexTitle}`)
    }
    return cachedVersions
  }

  try {
    const response = await fetch(`https://www.sefaria.org/api/texts/${indexTitle}`)
    
    if (!response.ok) {
      throw new Error(`Sefaria API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const parsedData = SefariaVersionsResponseSchema.parse(data)
    
    // Cache the versions with longer TTL since they don't change often
    sefariaCache.set(versionsCacheKey, parsedData.versions, CACHE_TTL.ONE_HOUR)
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ Versions cache MISS: ${indexTitle} (found ${parsedData.versions.length} versions)`)
    }
    
    return parsedData.versions
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid versions response format from Sefaria API: ${error.message}`)
    }
    
    if (error instanceof Error) {
      throw error
    }
    
    throw new Error('Unknown error occurred while fetching versions from Sefaria API')
  }
}

// Helper to pick the best version for a language
export function pickPreferredVersion(versions: SefariaVersion[], lang = 'en'): SefariaVersion | null {
  // Filter by language
  const langVersions = versions.filter(v => v.language === lang)
  
  if (langVersions.length === 0) {
    return null
  }
  
  // Sort by priority (higher priority first), then take the first one
  langVersions.sort((a, b) => (b.priority || 0) - (a.priority || 0))
  
  return langVersions[0]
}

// Helper to extract index title from a reference
export function extractIndexTitle(ref: string): string {
  // Remove chapter and verse numbers to get the book/text title
  // Examples: "Genesis 1:1" -> "Genesis", "Mesillat Yesharim 2:3" -> "Mesillat Yesharim"
  return ref.replace(/\s+\d+.*$/, '')
}

// Export cache utilities for debugging/monitoring
export function getCacheStats() {
  return sefariaCache.getStats()
}

export function clearCache() {
  sefariaCache.clear()
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Sefaria cache cleared')
  }
}

// Get random text from Sefaria
export async function getRandomText(params?: { category?: string }): Promise<SefariaTextResult> {
  const { category } = params || {}

  const queryParams = new URLSearchParams()
  if (category) {
    queryParams.set('categories', category)
  }

  const url = `https://www.sefaria.org/api/texts/random${queryParams.toString() ? `?${queryParams.toString()}` : ''}`

  // Check cache first
  const cacheKey = createCacheKey(url)
  const cachedResult = sefariaCache.get(cacheKey) as SefariaTextResult | null
  
  if (cachedResult) {
    return cachedResult
  }

  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Sefaria random API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    const parsedData = SefariaTextResponseSchema.parse(data)
    
    // Check if it's an error response
    if ('error' in parsedData) {
      throw new Error(`Sefaria random API error: ${parsedData.error}`)
    }
    
    // Helper function to extract text from array or string
    const extractText = (textData: string | string[] | undefined): string | undefined => {
      if (!textData) return undefined
      return Array.isArray(textData) ? textData.join(' ') : textData
    }
    
    // Build result
    const result: SefariaTextResult = {
      ref: parsedData.ref,
      text: extractText(parsedData.text),
      he: extractText(parsedData.he),
      versions: parsedData.versions || []
    }
    
    // Cache the successful result with shorter TTL since random content changes
    sefariaCache.set(cacheKey, result, CACHE_TTL.FIVE_MINUTES)
    
    return result
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid response format from Sefaria random API: ${error.message}`)
    }
    
    if (error instanceof Error) {
      throw error
    }
    
    throw new Error('Unknown error occurred while fetching random text from Sefaria API')
  }
}

// Log cache stats periodically in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  let statsInterval: NodeJS.Timeout | null = null
  
  const logStats = () => {
    const stats = getCacheStats()
    if (stats.hits + stats.misses > 0) {
      console.log(`📊 Sefaria Cache Stats: ${stats.hits} hits, ${stats.misses} misses, ${(stats.hitRate * 100).toFixed(1)}% hit rate, ${stats.size} entries`)
    }
  }
  
  // Log stats every 30 seconds if there's activity
  statsInterval = setInterval(logStats, 30000)
  
  // Clear interval on page unload
  window.addEventListener('beforeunload', () => {
    if (statsInterval) {
      clearInterval(statsInterval)
    }
  })
}