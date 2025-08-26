'use client'

import { useState, useEffect } from 'react'
import { getCacheStats } from '../../../lib/sefaria'
import RichContent from '../../components/RichContent'

interface ApiResponse {
  ref: string
  text: string
  lang: string
  versionUsed: string
  isRandom?: boolean
  category?: string
}

interface ApiError {
  error: string
  message?: string
  details?: Array<{ field: string; message: string }>
}

interface SefariaVersion {
  versionTitle: string
  language: string
  priority?: number
  versionSource?: string
  versionNotes?: string
}

export default function DemoPage() {
  const [tref, setTref] = useState('')
  const [lang, setLang] = useState<'en' | 'he'>('en')
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0, hitRate: 0, size: 0 })
  
  // Version selection drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [versions, setVersions] = useState<SefariaVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [currentIndexTitle, setCurrentIndexTitle] = useState('')
  const [selectedVersion, setSelectedVersion] = useState('')

  // Update cache stats every few seconds
  useEffect(() => {
    const updateStats = () => {
      try {
        const stats = getCacheStats()
        setCacheStats(stats)
      } catch {
        // Cache stats not available on server side
      }
    }
    
    updateStats()
    const interval = setInterval(updateStats, 2000)
    return () => clearInterval(interval)
  }, [])

  // Load selected version from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sefaria-selected-version')
    if (saved) {
      setSelectedVersion(saved)
      setVersion(saved)
    }
  }, [])

  // Helper function to extract index title from reference
  const extractIndexTitle = (ref: string): string => {
    return ref.replace(/\s+\d+.*$/, '').replace(/,.*$/, '')
  }

  // Fetch versions for a text
  const fetchVersions = async (indexTitle: string) => {
    if (!indexTitle) return
    
    setVersionsLoading(true)
    setCurrentIndexTitle(indexTitle)
    
    try {
      // Call our existing API endpoint to get versions
      const response = await fetch(`/api/sefaria/text?tref=${encodeURIComponent(indexTitle)}&lang=en`)
      if (!response.ok) {
        throw new Error('Failed to fetch versions')
      }
      
      // For now, we'll fetch versions using a separate call to the getVersions API
      // Let's create a simple API call to get versions
      const versionsResponse = await fetch(`/api/sefaria/versions?indexTitle=${encodeURIComponent(indexTitle)}`)
      if (versionsResponse.ok) {
        const versionsData = await versionsResponse.json()
        // Filter to English versions only and sort by priority
        const englishVersions = versionsData.versions
          .filter((v: SefariaVersion) => v.language === 'en')
          .sort((a: SefariaVersion, b: SefariaVersion) => (b.priority || 0) - (a.priority || 0))
        
        setVersions(englishVersions)
      } else {
        // Fallback to empty list if versions API not available
        setVersions([])
      }
    } catch (err) {
      console.error('Error fetching versions:', err)
      setVersions([])
    } finally {
      setVersionsLoading(false)
    }
  }

  // Handle version selection
  const handleVersionSelect = (versionTitle: string) => {
    setSelectedVersion(versionTitle)
    setVersion(versionTitle)
    localStorage.setItem('sefaria-selected-version', versionTitle)
    setDrawerOpen(false)
  }

  // Clear version selection
  const clearVersionSelection = () => {
    setSelectedVersion('')
    setVersion('')
    localStorage.removeItem('sefaria-selected-version')
    setDrawerOpen(false)
  }

  const handleFetch = async () => {
    if (!tref.trim()) {
      setError('Please enter a text reference')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const params = new URLSearchParams({
        tref: tref.trim(),
        lang,
      })
      
      if (version.trim()) {
        params.set('version', version.trim())
      }

      const response = await fetch(`/api/sefaria/text?${params}`)
      const data = await response.json()

      if (!response.ok) {
        const apiError = data as ApiError
        if (apiError.details) {
          setError(`${apiError.error}: ${apiError.details.map(d => d.message).join(', ')}`)
        } else {
          setError(apiError.message || apiError.error || 'An error occurred')
        }
        return
      }

      setResult(data)
    } catch {
      setError('Failed to fetch text. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleFetch()
    }
  }

  const handleQuickFetch = async (reference: string) => {
    setTref(reference)
    setLang('en')
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      const params = new URLSearchParams({
        tref: reference,
        lang: 'en',
      })
      
      // Use selected version if available
      if (selectedVersion) {
        params.set('version', selectedVersion)
      }

      const response = await fetch(`/api/sefaria/text?${params}`)
      const data = await response.json()

      if (!response.ok) {
        const apiError = data as ApiError
        if (apiError.details) {
          setError(`${apiError.error}: ${apiError.details.map(d => d.message).join(', ')}`)
        } else {
          setError(apiError.message || apiError.error || 'An error occurred')
        }
        return
      }

      setResult(data)
    } catch {
      setError('Failed to fetch text. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleRandomFetch = async (category?: string) => {
    setTref(category ? `Random (${category})` : 'Random Text')
    setLang('en')
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      const params = new URLSearchParams({
        lang: 'en',
      })
      
      if (category) {
        params.set('category', category)
      }

      const response = await fetch(`/api/sefaria/random?${params}`)
      const data = await response.json()

      if (!response.ok) {
        const apiError = data as ApiError
        if (apiError.details) {
          setError(`${apiError.error}: ${apiError.details.map(d => d.message).join(', ')}`)
        } else {
          setError(apiError.message || apiError.error || 'An error occurred')
        }
        return
      }

      setResult(data)
    } catch {
      setError('Failed to fetch random text. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Sefaria Text Fetcher
              </h1>
              <p className="text-gray-600">
                Enter a text reference to fetch from Sefaria&apos;s API
              </p>
            </div>
            {(cacheStats.hits + cacheStats.misses) > 0 && (
              <div className="text-right text-sm bg-gray-50 px-3 py-2 rounded-lg">
                <div className="font-medium text-gray-900">Cache Stats</div>
                <div className="text-gray-600">
                  {cacheStats.hits}H / {cacheStats.misses}M ({(cacheStats.hitRate * 100).toFixed(0)}%)
                </div>
                <div className="text-gray-500">{cacheStats.size} entries</div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="tref" className="block text-sm font-medium text-gray-700 mb-2">
                Text Reference
              </label>
              <input
                id="tref"
                type="text"
                value={tref}
                onChange={(e) => setTref(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mesillat Yesharim 1:1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="lang" className="block text-sm font-medium text-gray-700 mb-2">
                  Language
                </label>
                <select
                  id="lang"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as 'en' | 'he')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="en">English</option>
                  <option value="he">Hebrew</option>
                </select>
              </div>

              <div className="flex-1">
                <label htmlFor="version" className="block text-sm font-medium text-gray-700 mb-2">
                  Version {selectedVersion && <span className="text-green-600">(Selected)</span>}
                </label>
                <div className="flex gap-2">
                  <input
                    id="version"
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="JPS 1917"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                  <button
                    onClick={() => {
                      const indexTitle = extractIndexTitle(tref)
                      if (indexTitle) {
                        fetchVersions(indexTitle)
                        setDrawerOpen(true)
                      }
                    }}
                    disabled={!tref.trim()}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Browse versions"
                  >
                    📚
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleFetch}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {loading ? 'Fetching...' : 'Fetch Text'}
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={() => handleRandomFetch('Tanakh')}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  {loading ? 'Fetching...' : 'Random (Tanakh)'}
                </button>
                
                <button
                  onClick={() => handleRandomFetch()}
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                >
                  {loading ? 'Fetching...' : 'Random (Any)'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Ramchal Quickstart Panel */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Ramchal Works on Sefaria
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Complete collection of Rabbi Moshe Chaim Luzzatto&apos;s works available on Sefaria, including his masterwork Derekh Hashem
          </p>
          
          {/* Main philosophical works */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Major Philosophical Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={() => handleQuickFetch('Mesillat Yesharim')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Mesillat Yesharim</div>
                <div className="text-xs text-gray-500 mt-1">Path of the Just</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch("Da'at Tevunot")}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Da&apos;at Tevunot</div>
                <div className="text-xs text-gray-500 mt-1">Knowledge of Understanding</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Essay on Fundamentals')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Essay on Fundamentals</div>
                <div className="text-xs text-gray-500 mt-1">Summary of Derekh Hashem</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Derekh Hashem, Introduction')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Derekh Hashem</div>
                <div className="text-xs text-gray-500 mt-1">The Way of God - Introduction</div>
              </button>
            </div>
          </div>

          {/* Kabbalistic & Logic works */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Kabbalistic & Academic Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={() => handleQuickFetch('Kalach Pitchei Chokhmah')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Kalach Pitchei Chokhmah</div>
                <div className="text-xs text-gray-500 mt-1">138 Openings of Wisdom</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Derech Etz Chayim (Ramchal)')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Derech Etz Chayim</div>
                <div className="text-xs text-gray-500 mt-1">Intro to Pitchei Chokhmah</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Asarah Perakim LeRamchal')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Asarah Perakim</div>
                <div className="text-xs text-gray-500 mt-1">Ten Chapters</div>
              </button>
            </div>
          </div>

          {/* Derekh Hashem - Special section for the masterwork */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Derekh Hashem - The Way of God</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={() => handleQuickFetch('Derekh Hashem, Part One, On the Creator')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Part I: On the Creator</div>
                <div className="text-xs text-gray-500 mt-1">Divine existence & purpose</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Derekh Hashem, Part Two, On Divine Providence in General')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Part II: Divine Providence</div>
                <div className="text-xs text-gray-500 mt-1">How God governs the world</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Derekh Hashem, Part Three, On the Soul and Its Activities')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Part III: Soul & Prophecy</div>
                <div className="text-xs text-gray-500 mt-1">Spiritual dimensions</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Derekh Hashem, Part Four, On Divine Service')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Part IV: Divine Service</div>
                <div className="text-xs text-gray-500 mt-1">Torah, prayer & mitzvot</div>
              </button>
            </div>
          </div>

          {/* Academic works */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Logic & Rhetoric</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => handleQuickFetch('Sefer HaHiggayon')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Sefer HaHiggayon</div>
                <div className="text-xs text-gray-500 mt-1">Book of Logic</div>
              </button>
              
              <button
                onClick={() => handleQuickFetch('Sefer HaMelitzah')}
                disabled={loading}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <div className="font-semibold">Sefer HaMelitzah</div>
                <div className="text-xs text-gray-500 mt-1">Book of Rhetoric</div>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-1 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {result.ref}
                {result.isRandom && (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Random
                  </span>
                )}
              </h2>
              <div className="mt-1 text-sm text-gray-500">
                Language: {result.lang === 'en' ? 'English' : 'Hebrew'} • 
                Version: {result.versionUsed}
                {result.category && (
                  <> • Category: {result.category}</>
                )}
              </div>
            </div>
            <div className="px-6 py-6">
              <RichContent 
                content={result.text}
                className={`prose-lg ${result.lang === 'he' ? 'text-right' : 'text-left'}`}
              />
            </div>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No text fetched</h3>
            <p className="mt-1 text-sm text-gray-500">Enter a reference and click fetch to get started.</p>
          </div>
        )}

        {/* Version Selection Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center p-0 z-50 sm:items-center sm:p-4">
            <div className="bg-white rounded-t-lg sm:rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-hidden sm:max-h-[80vh]">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Select Version</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {currentIndexTitle} • {versions.length} English versions available
                  </p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="px-6 py-4 overflow-y-auto max-h-80">
                {versionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <svg className="animate-spin h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="ml-2 text-gray-600">Loading versions...</span>
                  </div>
                ) : versions.length > 0 ? (
                  <div className="space-y-2">
                    {selectedVersion && (
                      <button
                        onClick={clearVersionSelection}
                        className="w-full p-3 text-left bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      >
                        <div className="font-medium text-red-800">Clear Selection</div>
                        <div className="text-sm text-red-600">Use default version selection</div>
                      </button>
                    )}
                    {versions.map((version) => (
                      <button
                        key={version.versionTitle}
                        onClick={() => handleVersionSelect(version.versionTitle)}
                        className={`w-full p-3 text-left border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          selectedVersion === version.versionTitle
                            ? 'bg-blue-50 border-blue-200 text-blue-900'
                            : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{version.versionTitle}</div>
                            {version.versionSource && (
                              <div className="text-sm text-gray-600 mt-1">{version.versionSource}</div>
                            )}
                            {version.versionNotes && (
                              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{version.versionNotes}</div>
                            )}
                          </div>
                          <div className="flex items-center ml-4">
                            {version.priority && (
                              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                Priority: {version.priority}
                              </span>
                            )}
                            {selectedVersion === version.versionTitle && (
                              <span className="ml-2 text-blue-600">✓</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No English versions available for this text.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Rich Text Preview Example */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Rich Text Preview</h2>
          <p className="text-gray-600 mb-4">
            Test the rich content rendering with markdown, Hebrew text, and mixed formatting:
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rich Content Input
              </label>
              <textarea
                className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm text-black"
                defaultValue={`# Heading

**Bold** _italic_ ~~strikethrough~~

> Quote block

- list
- items

\`\`\`js
console.log('code');
\`\`\`

<b>עניין התפלה</b> — Hebrew RTL paragraph: שלום עליכם

[Link](https://example.com)`}
                onChange={(e) => {
                  // You could add state to make this interactive
                  const preview = document.getElementById('rich-preview')
                  if (preview) {
                    preview.setAttribute('data-content', e.target.value)
                  }
                }}
              />
            </div>
            
            {/* Preview area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rendered Preview
              </label>
              <div 
                id="rich-preview"
                className="h-64 p-4 border border-gray-300 rounded-md bg-gray-50 overflow-y-auto"
              >
                <RichContent 
                  content={`# Heading

**Bold** _italic_ ~~strikethrough~~

> Quote block

- list  
- items

\`\`\`js
console.log('code');
\`\`\`

<b>עניין התפלה</b> — Hebrew RTL paragraph: שלום עליכם

[Link](https://example.com)`}
                  className="prose-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}