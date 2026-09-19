'use client'

import { useState, type ReactNode } from 'react'
import {
  parseInline,
  parseMarkdown,
  type InlineToken,
  type MarkdownBlock,
} from '../../lib/chat-markdown'

export interface ChatMessageContentProps {
  content: string
  role?: 'user' | 'assistant' | 'system'
  className?: string
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
    >
      <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-emerald-300"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-mono text-white/50">
        <span className="uppercase tracking-wider">{language || 'code'}</span>
        <button
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
          onClick={handleCopy}
          title="Copy code"
          type="button"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-cyan-100/90 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderInlineTokens(tokens: InlineToken[], role: 'user' | 'assistant' | 'system'): ReactNode[] {
  const isUser = role === 'user'

  return tokens.map((token, index) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong
            className={isUser ? 'font-semibold text-neutral-950' : 'font-semibold text-white'}
            key={index}
          >
            {token.content}
          </strong>
        )
      case 'italic':
        return (
          <em
            className={isUser ? 'italic text-neutral-900' : 'italic text-white/90'}
            key={index}
          >
            {token.content}
          </em>
        )
      case 'bold_italic':
        return (
          <strong
            className={isUser ? 'font-semibold text-neutral-950' : 'font-semibold text-white'}
            key={index}
          >
            <em className="italic">{token.content}</em>
          </strong>
        )
      case 'code':
        return (
          <code
            className={
              isUser
                ? 'rounded bg-black/10 px-1.5 py-0.5 font-mono text-[11.5px] text-neutral-900'
                : 'rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11.5px] text-cyan-200'
            }
            key={index}
          >
            {token.content}
          </code>
        )
      case 'strikethrough':
        return (
          <del
            className={isUser ? 'line-through text-neutral-600' : 'line-through text-white/50'}
            key={index}
          >
            {token.content}
          </del>
        )
      case 'link':
        return (
          <a
            className={
              isUser
                ? 'font-medium underline underline-offset-2 text-neutral-950'
                : 'text-cyan-300 underline underline-offset-2 transition hover:text-cyan-200'
            }
            href={token.href}
            key={index}
            rel="noopener noreferrer"
            target="_blank"
          >
            {token.text}
          </a>
        )
      case 'text': {
        // Handle single newlines within paragraph text
        if (token.content.includes('\n')) {
          const parts = token.content.split('\n')
          return (
            <span key={index}>
              {parts.map((part, pi) => (
                <span key={pi}>
                  {pi > 0 && <br />}
                  {part}
                </span>
              ))}
            </span>
          )
        }
        return <span key={index}>{token.content}</span>
      }
      default:
        return null
    }
  })
}

function renderInline(text: string, role: 'user' | 'assistant' | 'system'): ReactNode {
  return renderInlineTokens(parseInline(text), role)
}

export function ChatMessageContent({
  content,
  role = 'assistant',
  className = '',
}: ChatMessageContentProps) {
  if (!content) return null

  // If user message without markdown indicators, preserve simple whitespace-pre-wrap
  if (role === 'user' && !content.includes('`') && !content.includes('*') && !content.includes('[')) {
    return <div className={`whitespace-pre-wrap break-words leading-[1.5] ${className}`}>{content}</div>
  }

  const blocks = parseMarkdown(content)

  // Fallback to simple inline if no blocks were identified
  if (blocks.length === 0) {
    return (
      <div className={`break-words leading-[1.55] ${className}`}>
        {renderInline(content, role)}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1.5 break-words ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            if (block.level === 1) {
              return (
                <h1
                  className="mt-2 mb-1 text-[14.5px] font-bold tracking-tight text-white first:mt-0"
                  key={index}
                >
                  {renderInline(block.text, role)}
                </h1>
              )
            }
            if (block.level === 2) {
              return (
                <h2
                  className="mt-2 mb-1 text-[13.5px] font-semibold tracking-tight text-white first:mt-0"
                  key={index}
                >
                  {renderInline(block.text, role)}
                </h2>
              )
            }
            return (
              <div
                className="mt-1.5 mb-1 text-[13px] font-semibold leading-snug tracking-tight text-white first:mt-0"
                key={index}
              >
                {renderInline(block.text, role)}
              </div>
            )
          }

          case 'list': {
            if (block.ordered) {
              return (
                <ol className="my-1.5 space-y-1.5 pl-0.5" key={index}>
                  {block.items.map((item, itemIdx) => (
                    <li
                      className="flex items-start gap-2 text-[13px] leading-[1.5] text-white/[0.88]"
                      key={itemIdx}
                    >
                      <span className="shrink-0 select-none pt-[1px] font-mono text-[11px] font-medium text-cyan-300/80">
                        {item.num ?? itemIdx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">{renderInline(item.text, role)}</div>
                    </li>
                  ))}
                </ol>
              )
            }
            return (
              <ul className="my-1.5 space-y-1.5 pl-0.5" key={index}>
                {block.items.map((item, itemIdx) => (
                  <li
                    className="flex items-start gap-2 text-[13px] leading-[1.5] text-white/[0.88]"
                    key={itemIdx}
                  >
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/85" />
                    <div className="min-w-0 flex-1">{renderInline(item.text, role)}</div>
                  </li>
                ))}
              </ul>
            )
          }

          case 'code_block':
            return <CodeBlock code={block.code} key={index} language={block.language} />

          case 'blockquote':
            return (
              <blockquote
                className="my-1.5 rounded-r border-l-2 border-cyan-400/60 bg-white/[0.02] py-1 pr-2 pl-3 text-[12.5px] italic text-white/75"
                key={index}
              >
                {renderInline(block.text, role)}
              </blockquote>
            )

          case 'horizontal_rule':
            return <hr className="my-2 border-white/10" key={index} />

          case 'table':
            return (
              <div
                className="my-2 overflow-x-auto rounded-xl border border-white/10 bg-black/20"
                key={index}
              >
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.04]">
                      {block.headers.map((h, hi) => (
                        <th className="px-3 py-1.5 font-semibold text-white" key={hi}>
                          {renderInline(h, role)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr
                        className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02]"
                        key={ri}
                      >
                        {row.map((cell, ci) => (
                          <td className="px-3 py-1.5 text-white/80" key={ci}>
                            {renderInline(cell, role)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

          case 'paragraph':
          default:
            return (
              <p
                className="my-1 text-[13px] leading-[1.55] text-white/[0.88] first:mt-0 last:mb-0"
                key={index}
              >
                {renderInline(block.text, role)}
              </p>
            )
        }
      })}
    </div>
  )
}
