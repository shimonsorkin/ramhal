/**
 * Text normalization utilities for markdown rendering
 */

/**
 * Normalize text for markdown rendering by:
 * - Converting single newlines inside sentences to spaces
 * - Preserving double newlines as paragraph breaks
 * - Cleaning up excessive whitespace
 */
export function normalizeForMarkdown(text: string): string {
  if (!text) return ''
  
  return text
    // Replace single newlines with spaces (but preserve double newlines)
    .replace(/([^\n])\n([^\n])/g, '$1 $2')
    // Clean up multiple spaces
    .replace(/ +/g, ' ')
    // Clean up multiple newlines (keep maximum of 2)
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace from start and end
    .trim()
}

/**
 * Detect if text is primarily RTL (Hebrew, Arabic, etc.)
 */
export function isRTLText(text: string): boolean {
  if (!text) return false
  
  // Remove HTML tags and common punctuation for more accurate detection
  const cleanText = text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[.,;:!?()[\]{}"'`\-—–]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
  
  if (cleanText.length === 0) return false
  
  let rtlChars = 0
  let totalChars = 0
  
  for (const char of cleanText) {
    const code = char.charCodeAt(0)
    
    // Count characters that contribute to direction detection
    if (
      // Latin alphabet
      (code >= 0x0041 && code <= 0x005A) || // A-Z
      (code >= 0x0061 && code <= 0x007A) || // a-z
      // Hebrew
      (code >= 0x0590 && code <= 0x05FF) || // Hebrew block
      // Arabic
      (code >= 0x0600 && code <= 0x06FF) || // Arabic block
      (code >= 0x0750 && code <= 0x077F) || // Arabic Supplement
      (code >= 0xFB50 && code <= 0xFDFF) || // Arabic Presentation Forms-A
      (code >= 0xFE70 && code <= 0xFEFF)    // Arabic Presentation Forms-B
    ) {
      totalChars++
      
      // Count RTL characters
      if (
        (code >= 0x0590 && code <= 0x05FF) || // Hebrew
        (code >= 0x0600 && code <= 0x06FF) || // Arabic
        (code >= 0x0750 && code <= 0x077F) || // Arabic Supplement
        (code >= 0xFB50 && code <= 0xFDFF) || // Arabic Presentation Forms-A
        (code >= 0xFE70 && code <= 0xFEFF)    // Arabic Presentation Forms-B
      ) {
        rtlChars++
      }
    }
  }
  
  // Consider text RTL if more than 30% of directional characters are RTL
  return totalChars > 0 && (rtlChars / totalChars) > 0.3
}