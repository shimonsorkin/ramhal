import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import { normalizeForMarkdown, isRTLText } from '../../lib/text'
import { cn } from '../../lib/utils'
import styles from './RichContent.module.css'

// Process citations to make them clickable
function processCitations(
  content: string, 
  witnesses: Array<{tref: string; text: string; hebrew?: string}>, 
  onWitnessClick?: (witness: {tref: string; text: string; hebrew?: string}) => void,
  isVerified: boolean = false
): string {
  if (!onWitnessClick) return content
  
  // Find all (tref) patterns and replace with clickable links
  return content.replace(/\(([^)]+)\)/g, (match, trefText) => {
    // Handle special case for "(Needs source)" in verified mode
    if (trefText === 'Needs source' && isVerified) {
      return `<span class="text-orange-600 text-sm font-medium">(Needs source)</span>`
    }
    
    // Find matching witness
    const witness = witnesses.find(w => w.tref === trefText)
    if (witness) {
      // Create a clickable citation - we'll handle the click in the component
      return `<span class="citation-link" data-tref="${trefText}">[${trefText}]</span>`
    }
    
    // Non-clickable text for invalid trefs
    return match
  })
}

// Custom sanitization schema that allows safe formatting
const customSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow dir and lang attributes for RTL support, plus citation data
    span: [...(defaultSchema.attributes?.span || []), 'dir', 'lang', 'className', 'class', 'data-tref'],
    div: [...(defaultSchema.attributes?.div || []), 'dir', 'lang', 'className', 'class'],
    p: [...(defaultSchema.attributes?.p || []), 'dir', 'lang', 'className', 'class'],
    // Allow href, title, target, rel for links
    a: ['href', 'title', 'target', 'rel'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // Text formatting
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sup', 'sub',
    // Block elements
    'blockquote', 'pre', 'code',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li',
    // Tables
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    // Links and containers
    'a', 'span', 'div'
  ]
}

interface Witness {
  tref: string
  text: string
  hebrew?: string
}

interface RichContentProps {
  content: string
  className?: string
  witnesses?: Witness[]
  onWitnessClick?: (witness: Witness) => void
  isVerified?: boolean
}

export default function RichContent({ 
  content, 
  className = '', 
  witnesses = [], 
  onWitnessClick,
  isVerified = false 
}: RichContentProps) {
  // Process content to make citations clickable if witnesses are provided
  const processedContent = witnesses.length > 0 ? processCitations(content, witnesses, onWitnessClick, isVerified) : content
  
  // Normalize the content for better markdown rendering
  const normalizedContent = normalizeForMarkdown(processedContent)
  
  // Handle clicks on citation links
  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('citation-link') && onWitnessClick) {
      const tref = target.getAttribute('data-tref')
      if (tref) {
        const witness = witnesses.find(w => w.tref === tref)
        if (witness) {
          onWitnessClick(witness)
        }
      }
    }
  }

  return (
    <div
      className={cn(
        // Base prose styling with Tailwind Typography - larger, more readable
        'prose prose-xl max-w-none',
        // Force black text for better readability with improved line height and spacing
        'text-gray-900 leading-relaxed',
        'prose-p:text-gray-900 prose-p:leading-relaxed prose-p:mb-6 prose-p:text-base',
        'prose-li:text-gray-900 prose-td:text-gray-900 prose-th:text-gray-900',
        // ENHANCED headings with dramatic styling and proper spacing - ensuring all headings are prominent
        'prose-headings:font-bold prose-headings:text-gray-900 prose-headings:mb-6 prose-headings:mt-8',
        'prose-h1:text-4xl prose-h1:font-extrabold prose-h1:mb-8 prose-h1:mt-0 prose-h1:bg-gradient-to-r prose-h1:from-blue-600 prose-h1:to-purple-600 prose-h1:bg-clip-text prose-h1:text-transparent',
        'prose-h4:text-xl prose-h4:font-semibold prose-h4:text-gray-700 prose-h4:mb-3 prose-h4:mt-5 prose-h4:border-l-2 prose-h4:border-gray-400 prose-h4:pl-3',
        'prose-h5:text-lg prose-h5:font-semibold prose-h5:text-gray-700 prose-h5:border-l-2 prose-h5:border-gray-300 prose-h5:pl-2',
        'prose-h6:text-base prose-h6:font-semibold prose-h6:text-gray-600',
        // Better code styling with enhanced appearance
        'prose-pre:rounded-xl prose-pre:bg-gray-900 prose-pre:shadow-xl prose-pre:border prose-pre:border-gray-700',
        'prose-code:bg-blue-50 prose-code:text-blue-800 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-medium prose-code:border prose-code:border-blue-200',
        // Enhanced blockquotes with better visual hierarchy
        'prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:pl-6 prose-blockquote:pr-4 prose-blockquote:py-4 prose-blockquote:rounded-r-lg prose-blockquote:italic prose-blockquote:text-gray-800 prose-blockquote:shadow-md prose-blockquote:my-6',
        // Better link styling with enhanced interactivity
        'prose-a:text-blue-600 prose-a:font-medium hover:prose-a:text-blue-800 hover:prose-a:underline prose-a:transition-colors prose-a:duration-200',
        // ENHANCED list styling with superior spacing and visual hierarchy
        'prose-ul:space-y-4 prose-ol:space-y-4 prose-ul:my-8 prose-ol:my-8',
        'prose-ul:ml-0 prose-ol:ml-0 prose-ul:pl-8 prose-ol:pl-8',
        'prose-li:marker:text-blue-600 prose-li:marker:font-bold prose-li:text-gray-900 prose-li:leading-relaxed prose-li:mb-3 prose-li:pl-2',
        'prose-li:bg-gradient-to-r prose-li:from-blue-50/30 prose-li:to-transparent prose-li:rounded-r-lg prose-li:py-2 prose-li:px-3 prose-li:transition-all prose-li:duration-200',
        'hover:prose-li:from-blue-100/50 hover:prose-li:shadow-sm hover:prose-li:transform hover:prose-li:translate-x-1',
        // Better table styling with enhanced appearance
        'prose-table:border-collapse prose-table:shadow-lg prose-table:rounded-lg prose-table:overflow-hidden prose-table:my-6',
        'prose-th:border prose-th:border-gray-300 prose-th:bg-gray-100 prose-th:p-4 prose-th:font-semibold prose-th:text-left prose-th:text-gray-700',
        'prose-td:border prose-td:border-gray-300 prose-td:p-4',
        // Enhanced strong/bold styling with better contrast
        'prose-strong:font-bold prose-strong:text-gray-900 prose-strong:bg-yellow-50 prose-strong:px-1 prose-strong:rounded',
        // Enhanced em/italic styling with subtle highlighting
        'prose-em:text-gray-700 prose-em:font-medium prose-em:bg-blue-50 prose-em:px-1 prose-em:rounded',
        // Better hr styling with enhanced appearance
        'prose-hr:border-gray-300 prose-hr:my-10 prose-hr:border-t-2',
        // CSS Module class for heading styling
        styles.richContentWrapper,
        // Custom class
        className
      )}
      onClick={handleClick}
    >
      <style jsx>{`
        /* Enhanced Citation Links */
        .citation-link {
          display: inline-flex;
          align-items: center;
          padding: 6px 14px;
          margin: 0 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #1e40af;
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
          border: 1px solid #93c5fd;
          border-radius: 24px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1), 0 1px 2px rgba(59, 130, 246, 0.06);
          position: relative;
          overflow: hidden;
        }
        .citation-link::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
          transition: left 0.5s;
        }
        .citation-link:hover::before {
          left: 100%;
        }
        .citation-link:hover {
          background: linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.25), 0 4px 8px rgba(59, 130, 246, 0.1);
          color: #1e3a8a;
        }
        .citation-link:focus {
          outline: 2px solid #3b82f6;
          outline-offset: 3px;
          background: linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%);
        }
        .citation-link:active {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }
        
        /* Enhanced Typography Effects */
        .prose h2 {
          position: relative;
          padding-left: 1rem;
        }
        .prose h2::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(to bottom, #3b82f6, #1d4ed8);
          border-radius: 2px;
        }
        
        
        /* Enhanced Strong/Bold with subtle animation */
        .prose strong {
          position: relative;
          transition: all 0.2s ease;
        }
        .prose strong:hover {
          background-color: #fef3c7 !important;
          transform: scale(1.02);
        }
        
        /* Enhanced Italic with subtle styling */
        .prose em {
          position: relative;
          font-style: italic;
          transition: all 0.2s ease;
        }
        .prose em:hover {
          background-color: #eff6ff !important;
          transform: scale(1.01);
        }
        
        /* ENHANCED Animated List Items with Superior Styling */
        .prose ul {
          list-style: none;
          position: relative;
        }
        
        .prose ol {
          position: relative;
        }
        
        .prose ul li {
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 12px 0 12px 24px;
          margin: 8px 0;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, transparent 100%);
          border-left: 3px solid transparent;
        }
        
        .prose ul li::before {
          content: '•';
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: #3b82f6;
          font-size: 1.2em;
          font-weight: bold;
          transition: all 0.3s ease;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.7; transform: translateY(-50%) scale(1.1); }
        }
        
        .prose ul li:hover {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 197, 253, 0.04) 100%);
          transform: translateX(4px);
          border-left-color: #3b82f6;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
        }
        
        .prose ul li:hover::before {
          color: #1d4ed8;
          transform: translateY(-50%) scale(1.2);
          animation: none;
        }
        
        .prose ol li {
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 12px 0;
          margin: 8px 0;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.04) 0%, transparent 100%);
          border-left: 3px solid transparent;
        }
        
        .prose ol li:hover {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(110, 231, 183, 0.04) 100%);
          transform: translateX(4px);
          border-left-color: #10b981;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
        }
        
        .prose ol li::marker {
          color: #10b981;
          font-weight: bold;
          font-size: 1.1em;
        }
        
        /* Nested Lists with Different Colors */
        .prose ul ul li {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.04) 0%, transparent 100%);
        }
        
        .prose ul ul li::before {
          content: '◦';
          color: #8b5cf6;
          font-size: 1.4em;
        }
        
        .prose ul ul li:hover {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(196, 181, 253, 0.04) 100%);
          border-left-color: #8b5cf6;
        }
        
        .prose ul ul ul li::before {
          content: '▪';
          color: #f59e0b;
          font-size: 1em;
        }
        
        /* Special List Item Types */
        .prose li:has(strong:first-child) {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(252, 211, 77, 0.04) 100%);
          border-left-color: #f59e0b;
          font-weight: 500;
        }
        
        .prose li:has(em:first-child) {
          background: linear-gradient(135deg, rgba(236, 72, 153, 0.06) 0%, rgba(251, 207, 232, 0.03) 100%);
          border-left-color: #ec4899;
          font-style: italic;
        }
        
        /* Enhanced Blockquotes with Quote Marks */
        .prose blockquote {
          position: relative;
          font-family: Georgia, serif;
        }
        .prose blockquote::before {
          content: '"';
          font-size: 4rem;
          color: #3b82f6;
          opacity: 0.3;
          position: absolute;
          top: -0.5rem;
          left: -0.5rem;
          font-family: Georgia, serif;
          line-height: 1;
        }
        
        /* Smooth Paragraph Transitions */
        .prose p {
          transition: all 0.2s ease;
          border-radius: 4px;
          padding: 2px 0;
        }
        .prose p:hover {
          background-color: #fafafa;
          padding-left: 4px;
        }
        
        /* Section Dividers */
        .prose hr {
          background: linear-gradient(to right, transparent, #d1d5db, transparent);
          height: 2px;
          border: none;
          position: relative;
        }
        .prose hr::after {
          content: '◆';
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 0 1rem;
          color: #6b7280;
        }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, customSchema],
          rehypeHighlight
        ]}
        components={{
          // Enhanced h2 component with inline styles - smaller and less prominent
          h2: ({ children, ...props }) => (
            <h2
              {...props}
              style={{
                position: 'relative',
                fontWeight: '600',
                color: '#1e40af',
                fontSize: '1.25rem',
                lineHeight: '1.4',
                marginTop: '1.5rem',
                marginBottom: '1rem',
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                borderLeft: '4px solid #3b82f6',
                borderRadius: '0 0.375rem 0.375rem 0',
                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.1)',
                transition: 'all 0.3s ease',
                display: 'block',
              }}
            >
              {children}
            </h2>
          ),

          // Enhanced h3 component with inline styles - smaller and less prominent
          h3: ({ children, ...props }) => (
            <h3
              {...props}
              style={{
                position: 'relative',
                fontWeight: '600',
                color: '#374151',
                fontSize: '1.125rem',
                lineHeight: '1.5',
                marginTop: '1.25rem',
                marginBottom: '0.75rem',
                padding: '0.375rem 0.75rem',
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                borderLeft: '3px solid #64748b',
                borderRadius: '0 0.25rem 0.25rem 0',
                boxShadow: '0 1px 2px rgba(100, 116, 139, 0.1)',
                transition: 'all 0.2s ease',
                display: 'block',
              }}
            >
              {children}
            </h3>
          ),

          // Enhanced paragraph component with RTL detection
          p: ({ children, ...props }) => {
            // Extract text content for RTL detection
            const textContent = React.Children.toArray(children)
              .map(child => {
                if (typeof child === 'string') return child
                if (React.isValidElement(child) && (child.props as {children?: React.ReactNode})?.children) {
                  const childProps = child.props as {children?: React.ReactNode}
                  return typeof childProps.children === 'string' ? childProps.children : ''
                }
                return ''
              })
              .join('')
            
            const isRTL = isRTLText(textContent)
            
            return (
              <p
                {...props}
                dir={isRTL ? 'rtl' : 'ltr'}
                className={cn(
                  isRTL ? 'text-right' : 'text-left',
                  props.className
                )}
              >
                {children}
              </p>
            )
          },
          
          // Enhanced link component with security attributes
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              {children}
            </a>
          ),
          
          // Enhanced code block with better styling
          code: (props: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
            const { className, children, inline, ...restProps } = props
            
            if (inline) {
              return (
                <code 
                  {...restProps}
                  className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono"
                >
                  {children}
                </code>
              )
            }
            
            return (
              <code 
                {...restProps}
                className={cn('font-mono text-sm', className)}
              >
                {children}
              </code>
            )
          },
          
          // Enhanced blockquote
          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              className="border-l-4 border-blue-500 pl-4 italic text-gray-700 my-4"
            >
              {children}
            </blockquote>
          ),
          
          // Enhanced table components
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table {...props} className="min-w-full border-collapse border border-gray-300">
                {children}
              </table>
            </div>
          ),
          
          th: ({ children, ...props }) => (
            <th
              {...props}
              className="border border-gray-300 bg-gray-50 px-3 py-2 text-left font-semibold"
            >
              {children}
            </th>
          ),
          
          td: ({ children, ...props }) => (
            <td
              {...props}
              className="border border-gray-300 px-3 py-2"
            >
              {children}
            </td>
          ),
          
          // ENHANCED List Components with Superior Styling
          ul: ({ children, ...props }) => (
            <ul
              {...props}
              className="space-y-2 my-6 list-none pl-0"
            >
              {children}
            </ul>
          ),
          
          ol: ({ children, ...props }) => (
            <ol
              {...props}
              className="space-y-2 my-6 list-decimal pl-6"
            >
              {children}
            </ol>
          ),
          
          li: ({ children, ...props }) => {
            // Check if this is part of an ordered or unordered list
            const isOrderedList = props.className?.includes('list-decimal') || 
                                  (props as any).ordered === true
            
            return (
              <li
                {...props}
                className={cn(
                  "relative transition-all duration-300 rounded-lg",
                  "hover:transform hover:translate-x-1 hover:shadow-sm",
                  isOrderedList 
                    ? "pl-2 py-2 bg-gradient-to-r from-emerald-50/30 to-transparent hover:from-emerald-100/50 border-l-3 border-transparent hover:border-emerald-500" 
                    : "pl-6 py-3 bg-gradient-to-r from-blue-50/30 to-transparent hover:from-blue-100/50 border-l-3 border-transparent hover:border-blue-500",
                  props.className
                )}
              >
                {!isOrderedList && (
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-blue-600 font-bold text-lg animate-pulse">
                    •
                  </span>
                )}
                <div className="relative z-10">
                  {children}
                </div>
              </li>
            )
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}