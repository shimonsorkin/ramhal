import { getTextV3, SefariaTextResult } from './sefaria'
import ramchalIndex from '../data/ramchal.json'

export interface Witness {
  tref: string
  text: string
}

interface RamchalChapter {
  number?: number
  title: string
  tref: string
  topics: string[]
}

interface RamchalWork {
  title: string
  alternativeTitles: string[]
  description: string
  structure: string
  keywords: string[]
  chapters?: RamchalChapter[]
  parts?: Array<{
    number: number
    title: string
    chapters: RamchalChapter[]
  }>
  tref?: string
}

export interface RAGBootstrapResult {
  question: string
  witnesses: Witness[]
  guesses: string[]
}

export interface VerificationResult {
  originalAnswer: string
  verifiedAnswer: string
  unsourcedSentences: number
  totalSentences: number
}

/**
 * Get all Ramchal works from the JSON index
 */
function getAllRamchalWorks(): RamchalWork[] {
  const works: RamchalWork[] = []
  
  // Main structured works
  if (ramchalIndex.works.mesillat_yesharim) {
    works.push(ramchalIndex.works.mesillat_yesharim as RamchalWork)
  }
  if (ramchalIndex.works.derekh_hashem) {
    works.push(ramchalIndex.works.derekh_hashem as RamchalWork)
  }
  if (ramchalIndex.works.daat_tevunot) {
    works.push(ramchalIndex.works.daat_tevunot as RamchalWork)
  }
  
  // Other works
  const otherWorks = ramchalIndex.works.other_works
  Object.values(otherWorks).forEach(work => {
    works.push(work as RamchalWork)
  })
  
  return works
}

/**
 * Find matching works based on question keywords
 */
function findMatchingWorks(question: string): RamchalWork[] {
  const normalizedQuestion = question.toLowerCase()
  const allWorks = getAllRamchalWorks()
  const matchedWorks: { work: RamchalWork; score: number }[] = []
  
  for (const work of allWorks) {
    let score = 0
    
    // Check title matches
    if (normalizedQuestion.includes(work.title.toLowerCase())) {
      score += 10
    }
    
    // Check alternative titles
    for (const altTitle of work.alternativeTitles) {
      if (normalizedQuestion.includes(altTitle.toLowerCase())) {
        score += 8
      }
    }
    
    // Check keywords
    for (const keyword of work.keywords) {
      if (normalizedQuestion.includes(keyword.toLowerCase())) {
        score += 3
      }
    }
    
    // Check chapter/part topics if available
    if (work.chapters) {
      for (const chapter of work.chapters) {
        for (const topic of chapter.topics) {
          if (normalizedQuestion.includes(topic.toLowerCase())) {
            score += 2
          }
        }
      }
    }
    
    if (work.parts) {
      for (const part of work.parts) {
        for (const chapter of part.chapters) {
          for (const topic of chapter.topics) {
            if (normalizedQuestion.includes(topic.toLowerCase())) {
              score += 2
            }
          }
        }
      }
    }
    
    if (score > 0) {
      matchedWorks.push({ work, score })
    }
  }
  
  // Sort by score (highest first) and return works
  return matchedWorks
    .sort((a, b) => b.score - a.score)
    .map(item => item.work)
    .slice(0, 3) // Limit to top 3 matches
}

/**
 * Generate witness references from matched works with ±2 chapter walking
 */
function generateWitnessRefs(matchedWorks: RamchalWork[]): string[] {
  const witnessRefs = new Set<string>()
  
  for (const work of matchedWorks) {
    if (work.structure === 'simple_chapters' && work.chapters) {
      // For simple chapter works (like Mesillat Yesharim), add 2-3 chapters
      const chaptersToAdd = Math.min(3, work.chapters.length)
      for (let i = 0; i < chaptersToAdd; i++) {
        witnessRefs.add(work.chapters[i].tref)
      }
    } else if (work.structure === 'complex_parts' && work.parts) {
      // For complex works (like Derekh Hashem), add key chapters from each part
      for (const part of work.parts.slice(0, 2)) { // Limit to first 2 parts
        for (const chapter of part.chapters.slice(0, 2)) { // Limit to first 2 chapters per part
          witnessRefs.add(chapter.tref)
        }
      }
    } else if (work.tref) {
      // For simple works, just add the main reference
      witnessRefs.add(work.tref)
    }
  }
  
  return Array.from(witnessRefs).slice(0, 8) // Limit total witnesses
}

/**
 * Add adjacent chapter references (±2 chapters) for deeper exploration
 */
function addAdjacentChapters(baseRefs: string[], matchedWorks: RamchalWork[]): string[] {
  const allRefs = new Set<string>(baseRefs)
  
  for (const work of matchedWorks) {
    if (work.structure === 'simple_chapters' && work.chapters) {
      // Find chapters mentioned in baseRefs and add adjacent ones
      for (const baseRef of baseRefs) {
        const chapterIndex = work.chapters.findIndex(ch => ch.tref === baseRef)
        if (chapterIndex >= 0) {
          // Add ±2 chapters
          for (let offset = -2; offset <= 2; offset++) {
            const targetIndex = chapterIndex + offset
            if (targetIndex >= 0 && targetIndex < work.chapters.length && offset !== 0) {
              allRefs.add(work.chapters[targetIndex].tref)
            }
          }
        }
      }
    }
  }
  
  return Array.from(allRefs).slice(0, 12) // Expanded limit for adjacent chapters
}

/**
 * Generate guess references using JSON index
 */
function generateGuessRefs(question: string): string[] {
  const matchedWorks = findMatchingWorks(question)
  
  if (matchedWorks.length === 0) {
    // Fallback to default references from major works
    const defaultWorks = [
      ramchalIndex.works.mesillat_yesharim as RamchalWork,
      ramchalIndex.works.derekh_hashem as RamchalWork,
      ramchalIndex.works.daat_tevunot as RamchalWork
    ].filter(Boolean)
    
    return generateWitnessRefs(defaultWorks)
  }
  
  // Generate base witnesses from matched works
  const baseRefs = generateWitnessRefs(matchedWorks)
  
  // Add adjacent chapters for deeper exploration
  const allRefs = addAdjacentChapters(baseRefs, matchedWorks)
  
  return allRefs
}

// The generateAdjacentRefs function is no longer needed as we handle
// adjacent chapters directly in the generateGuessRefs function

/**
 * Fetch witness texts for a set of references
 */
async function fetchWitnesses(refs: string[]): Promise<Witness[]> {
  const witnesses: Witness[] = []
  
  for (const ref of refs) {
    try {
      const result = await getTextV3(ref, { lang: 'en' })
      
      // Extract text content
      let textContent = ''
      if (result.text) {
        textContent = Array.isArray(result.text) ? result.text.join(' ') : result.text
      }
      
      // Only add if we have actual text content
      if (textContent && textContent.trim().length > 0) {
        witnesses.push({
          tref: result.ref || ref,
          text: textContent
        })
      }
    } catch (error) {
      // Continue with other references if one fails
      console.warn(`Failed to fetch witness for ${ref}:`, error)
    }
  }
  
  return witnesses
}

/**
 * Main RAG bootstrap function that generates witnesses for a question using JSON index
 */
export async function bootstrapRAG(question: string): Promise<RAGBootstrapResult> {
  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty')
  }
  
  // Step 1: Use JSON index to generate targeted witness references
  const witnessRefs = generateGuessRefs(question.trim())
  
  // Step 2: Fetch witness texts
  const witnesses = await fetchWitnesses(witnessRefs)
  
  return {
    question: question.trim(),
    witnesses,
    guesses: witnessRefs
  }
}

/**
 * Verify an LLM-generated answer by checking if each sentence has proper source citations
 */
export function verifyAnswer(answer: string, witnesses: Witness[]): VerificationResult {
  if (!answer || answer.trim().length === 0) {
    return {
      originalAnswer: answer,
      verifiedAnswer: answer,
      unsourcedSentences: 0,
      totalSentences: 0
    }
  }

  // Extract all valid trefs from witnesses for comparison
  const validTrefs = new Set(witnesses.map(w => w.tref))
  
  // Split answer into sentences - handle multiple sentence endings and abbreviations
  const sentences = answer
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  let unsourcedCount = 0
  
  const verifiedSentences = sentences.map(sentence => {
    // Find all (tref) patterns in this sentence
    const trefMatches = sentence.match(/\(([^)]+)\)/g)
    
    if (!trefMatches) {
      // No trefs found in sentence
      unsourcedCount++
      return `⚠️ ${sentence} (Needs source)`
    }
    
    // Check if at least one tref matches our witnesses
    const hasValidTref = trefMatches.some(match => {
      const tref = match.slice(1, -1) // Remove parentheses
      return validTrefs.has(tref)
    })
    
    if (!hasValidTref) {
      // Has trefs but none match our witnesses
      unsourcedCount++
      return `⚠️ ${sentence} (Needs source)`
    }
    
    // Has at least one valid tref
    return sentence
  })

  return {
    originalAnswer: answer,
    verifiedAnswer: verifiedSentences.join(' '),
    unsourcedSentences: unsourcedCount,
    totalSentences: sentences.length
  }
}