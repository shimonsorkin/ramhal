import OpenAI from 'openai'
import { Witness } from './rag'

// Lazy-initialize OpenAI client
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export interface SynthesisResult {
  answer: string
  tokensUsed: number
  model: string
}

/**
 * Synthesize an answer to a question using provided witnesses from Sefaria texts
 */
export async function synthesiseAnswer(
  question: string, 
  witnesses: Witness[]
): Promise<SynthesisResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty')
  }

  if (!witnesses || witnesses.length === 0) {
    throw new Error('At least one witness passage is required')
  }

  // Check if user is asking for Hebrew text
  const wantsHebrew = question.toLowerCase().includes('hebrew') || 
                     question.toLowerCase().includes('original') ||
                     question.toLowerCase().includes('lashon hakodesh')

  // Construct the system message with high-impact ChatGPT-grade template
  const systemMessage = `You are an expert on Ramchal's works. Write in Markdown with British English using ONLY the provided passages.

## REQUIRED STRUCTURE:

**1. TL;DR** (2–3 lines): Thesis + key takeaways

**2. H2 sections with PARALLEL PATTERN for each major idea:**
- **Claim.** Single clear sentence
- **Textual basis.** *Sefer* citations from Ramchal  
- **Scriptural anchor.** (blockquote if verse available)
- **Implication.** Why it matters for practice/theology

**3. Evidence map table** mapping concept → Ramchal source → Scriptural anchor

## CITATION FORMAT:
- *Sefarim* in italics: *Derekh Hashem* 1:2; *Mesillat Yesharim* 11:56
- Tanakh: **Book** 7:14 (bold book names)
- En-dashes for ranges: 11:2–6  
- NO mixing brackets/parentheses
- Every claim must have a source

## TYPOGRAPHY RULES:
- H2s start with noun phrases
- H3s with clear sub-topics  
- **Bold**: key concepts only (not whole phrases)
- *Italics*: sefarim titles, Hebrew terms
- Short, active sentences (≤2–3 per paragraph)
- British English: emphasise, rationalisation
- No filler phrases ("provides profound understanding")

## SCRIPTURE QUOTES:
> "Quote text here"  
> — **Book** 7:14

## QUALITY STANDARDS:
- All unsourced claims resolved
- Consistent H2/H3 hierarchy (no mid-sentence dashes)
- Parallel structure across sections
- Evidence-based reasoning
- Professional, authoritative tone`

  // Format witnesses into numbered list for the prompt
  const witnessText = witnesses
    .map((witness, index) => {
      let content = `[${index + 1}] ${witness.tref} — ${witness.text.substring(0, 500)}${witness.text.length > 500 ? '...' : ''}`
      
      // Include Hebrew text if requested and available
      if (wantsHebrew && witness.hebrew) {
        content += `\n\nHebrew Original: ${witness.hebrew.substring(0, 500)}${witness.hebrew.length > 500 ? '...' : ''}`
      }
      
      return content
    })
    .join('\n\n')

  const userPrompt = `Question: ${question}

Passages from Ramchal's works:

${witnessText}

APPLY THE TEMPLATE:
1. **TL;DR** (2–3 lines): Thesis + key takeaways
2. ## H2 sections using **Claim → Textual basis → Scriptural anchor → Implication**
3. **Evidence map table** with columns: Concept | Ramchal source | Scriptural anchor
4. Citations: *Sefarim* in italics; **Tanakh Books** in bold
5. Scripture quotes as blockquotes with source
6. British English, short sentences, no filler
7. Every claim sourced, consistent hierarchy
8. Professional, authoritative tone like the provided template`

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use the faster, cheaper model for this task
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user', 
          content: userPrompt
        }
      ],
      max_tokens: 500, // Allow for full ChatGPT-grade template with evidence map
      temperature: 0.3, // Lower temperature for more focused, factual responses
      top_p: 0.9,
    })

    const answer = completion.choices[0]?.message?.content
    
    if (!answer) {
      throw new Error('No response generated from OpenAI')
    }

    return {
      answer: answer.trim(),
      tokensUsed: completion.usage?.total_tokens || 0,
      model: completion.model
    }

  } catch (error) {
    if (error instanceof Error) {
      // Handle specific OpenAI API errors
      if (error.message.includes('API key')) {
        throw new Error('Invalid or missing OpenAI API key')
      }
      
      if (error.message.includes('rate limit')) {
        throw new Error('OpenAI API rate limit exceeded. Please try again later.')
      }
      
      if (error.message.includes('insufficient_quota')) {
        throw new Error('OpenAI API quota exceeded. Please check your account.')
      }
      
      throw new Error(`OpenAI API error: ${error.message}`)
    }
    
    throw new Error('Unknown error occurred while generating answer')
  }
}