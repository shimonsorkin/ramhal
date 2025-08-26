import { getTextV3 } from '../sefaria'

describe('getTextV3', () => {
  it('should fetch Genesis 1:1 and return non-empty English text', async () => {
    const result = await getTextV3('Genesis 1:1')
    
    expect(result).toBeDefined()
    expect(result.ref).toBe('Genesis 1:1')
    expect(result.text).toBeDefined()
    expect(typeof result.text).toBe('string')
    expect(result.text!.length).toBeGreaterThan(0)
  }, 10000)

  it('should handle Hebrew language option', async () => {
    const result = await getTextV3('Genesis 1:1', { lang: 'he' })
    
    expect(result).toBeDefined()
    expect(result.ref).toBe('Genesis 1:1')
    expect(result.he).toBeDefined()
    expect(typeof result.he).toBe('string')
    expect(result.he!.length).toBeGreaterThan(0)
  }, 10000)

  it('should handle invalid references with error', async () => {
    await expect(getTextV3('InvalidBook 999:999')).rejects.toThrow()
  }, 10000)

  it('should default to English language when no lang specified', async () => {
    const result = await getTextV3('Genesis 1:1')
    
    expect(result.text).toBeDefined()
    expect(typeof result.text).toBe('string')
  }, 10000)
})