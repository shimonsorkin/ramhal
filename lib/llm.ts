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

  // Construct the system message with strict guidelines and formatting instructions
  const systemMessage = `You may only answer using the provided Sefaria passages. When you use a passage, reference its tref inline in parentheses.

STRICT RULES:
- Only use information from the provided passages
- Always cite sources with (tref) inline references
- Keep answer under 200 words
- Be concise and direct
- Do not add outside knowledge or interpretations
- If the passages don't contain relevant information, say so clearly
- When asked for Hebrew text, include the original Hebrew from the passages if available
- If Hebrew text is requested but not available, state this clearly

FORMATTING REQUIREMENTS:
- Use proper markdown formatting for beautiful, readable responses
- Use **bold** for key concepts and important terms
- Use *italics* for Hebrew terms and emphasis
- Use ## for section headings when appropriate
- Use > for block quotes when citing longer passages
- Use bullet points (-) for lists
- Use --- for section dividers
- Structure responses with clear paragraphs
- Make citations clickable references like (Derekh Hashem, Part One:21)`

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

Please answer the question using only the information from these passages. Format your response beautifully with markdown:
- Use **bold** for key concepts
- Use *italics* for Hebrew terms
- Structure with clear paragraphs
- Include proper citations with (tref) references
- Use headings and lists when appropriate for clarity`

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
      max_tokens: 300, // Keep responses concise
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