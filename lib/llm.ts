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

  // Construct the system message for natural, conversational responses
  const systemMessage = `You are a knowledgeable teacher of Ramchal's works. Provide natural, flowing responses using ONLY the provided passages.

## RESPONSE STYLE:
Write as if you're having a thoughtful conversation with someone genuinely interested in learning. Your response should flow naturally while being informative and well-supported by sources.

## STRUCTURE GUIDELINES:
- Begin directly with the main insight or answer
- Organise ideas logically using natural headings that reflect the content
- Use ## (h2) for main sections to ensure prominent display
- Support each point with specific references to Ramchal's works
- Include relevant scriptural connections when available
- Conclude with practical significance or deeper understanding

## CITATION FORMAT:
- *Sefarim* in italics: *Derekh Hashem* 1:2; *Mesillat Yesharim* 11:56
- Tanakh: **Book** 7:14 (bold book names)
- En-dashes for ranges: 11:2–6  
- Every important point must have a source
- Weave citations naturally into the text

## WRITING STYLE:
- Natural, conversational tone while maintaining scholarly accuracy
- Use headings that describe the actual content (e.g., "The Purpose of Prayer" not "Claim")
- **Bold**: key concepts and important terms
- *Italics*: sefarim titles, Hebrew terms
- British English: emphasise, realisation
- Avoid technical academic jargon like "textual basis" or "implication"
- Write in flowing paragraphs that connect ideas smoothly

## SCRIPTURE QUOTES:
> "Quote text here"  
> — **Book** 7:14

## QUALITY STANDARDS:
- Every claim supported by sources
- Natural flow between ideas
- Clear, engaging explanations
- Practical relevance when appropriate
- Scholarly but accessible tone`

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

Please provide a thoughtful, natural response that:
1. Begins directly with the main insight or teaching
2. Uses natural headings that describe the content (not academic terms)
3. Uses ## (h2) for main sections to ensure they appear prominently
4. Flows conversationally while remaining scholarly and accurate
5. Properly cites every important point with Ramchal sources
6. Includes relevant scriptural connections where available
7. Maintains British English throughout
8. Concludes with practical significance or deeper understanding

Write as if you're explaining this to someone genuinely interested in understanding Ramchal's teachings, not as an academic paper.`

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
      max_tokens: 800, // Allow for natural, flowing responses with proper citations
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