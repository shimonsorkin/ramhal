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

  // Construct the system message with ChatGPT-grade formatting rules
  const systemMessage = `You are an expert on Ramchal's works. Answer using ONLY the provided passages with ChatGPT-grade formatting and precision.

## OPENING STRUCTURE:
1. Start with 2-3 line **TL;DR** summarising the thesis and key takeaways
2. Use clear theme title with consistent hierarchy

## HIERARCHY RULES:
- ## H2 = Major ideas only
- ### H3 = Sub-ideas under H2
- NO ad-hoc dashes or mixed styles
- Sentence-case headings ("Evil as absence of good")

## SECTION PATTERN (repeat for each major idea):
1. **Claim**: Single clear sentence
2. **Textual basis**: Primary citations from Ramchal
3. **Implication**: Why it matters for practice/theology
4. (Optional) **Notes**: Nuance or qualification

## CITATION FORMAT:
- Consistent format: *Sefarim* in italics (Derekh Hashem 1:2)
- Parenthetical citations: (Derekh Hashem, Part One:21)
- En-dashes for ranges: (Mesillat Yesharim 11:2–6)
- Scripture as blockquotes with source
- NO mixing brackets/parentheses or incomplete refs

## TYPOGRAPHY:
- *Italics*: sefarim titles, Hebrew terms, emphasis
- **Bold**: key concepts (not whole phrases)
- British English (rationalisation, emphasise)
- No fluff phrases like "provides profound understanding"

## SCRIPTURE QUOTES:
Use blockquotes:
> "Quote text here"
> — Book 7:14

## CONTENT RULES:
- Only use provided passages
- No outside knowledge
- Cite every claim
- Keep under 250 words
- Maintain parallel structure across sections`

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

RESPONSE FORMAT:
1. Open with **TL;DR** (2-3 lines maximum)
2. Use clear ## H2 and ### H3 hierarchy
3. Follow CLAIM → TEXTUAL BASIS → IMPLICATION pattern for each section
4. *Italics* for sefarim titles, **bold** for key concepts only
5. Consistent citations: (*Derekh Hashem*, Part One:21)
6. Scripture in blockquotes with source
7. British English, no fluff phrases
8. Keep under 250 words with parallel structure`

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
      max_tokens: 400, // Allow for structured ChatGPT-grade responses
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