import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import { normalizeForMarkdown, isRTLText } from '../../lib/text'
import { cn } from '../../lib/utils'

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
        // Base prose styling with Tailwind Typography
        'prose max-w-none',
        // Force black text for better readability
        'text-black prose-p:text-black prose-li:text-black prose-td:text-black prose-th:text-black',
        // Enhanced styling for better readability
        'prose-headings:font-semibold prose-headings:text-black',
        'prose-pre:rounded-xl prose-pre:bg-gray-900',
        'prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-black',
        'prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-black',
        'prose-a:text-blue-600 hover:prose-a:text-blue-800',
        // List styling
        'prose-ul:list-disc prose-ol:list-decimal',
        'prose-li:marker:text-gray-600',
        // Table styling
        'prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:p-2',
        'prose-td:border prose-td:border-gray-300 prose-td:p-2',
        // Strong/bold styling
        'prose-strong:font-semibold prose-strong:text-black',
        // Custom class
        className
      )}
      onClick={handleClick}
    >
      <style jsx>{`
        .citation-link {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          margin: 0 2px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #1d4ed8;
          background-color: #dbeafe;
          border-radius: 9999px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .citation-link:hover {
          background-color: #bfdbfe;
        }
        .citation-link:focus {
          outline: 2px solid #3b82f6;
          outline-offset: 1px;
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
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}