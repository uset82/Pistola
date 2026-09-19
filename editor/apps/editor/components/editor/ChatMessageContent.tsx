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
  speaker?: 'user' | 'assistant' | 'system'
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
      className="h-3.5 w-3.5"
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
    <div className="my-1.5 overflow-hidden rounded-[10px] border border-as-line bg-as-panel">
      <div className="flex items-center justify-between border-as-line-soft border-b px-3 py-1 font-mono text-[11px] text-as-faint">
        <span>{language || 'code'}</span>
        <button
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
          onClick={handleCopy}
          title="Copy code"
          type="button"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] text-as-text leading-relaxed [scrollbar-color:#3a3935_transparent] [scrollbar-width:thin]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderInlineTokens(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong className="font-semibold text-as-text" key={index}>
            {token.content}
          </strong>
        )
      case 'italic':
        return (
          <em className="italic" key={index}>
            {token.content}
          </em>
        )
      case 'bold_italic':
        return (
          <strong className="font-semibold text-as-text" key={index}>
            <em className="italic">{token.content}</em>
          </strong>
        )
      case 'code':
        return (
          <code
            className="rounded-[5px] bg-as-raised px-1.5 py-0.5 font-mono text-[12px] text-as-text"
            key={index}
          >
            {token.content}
          </code>
        )
      case 'strikethrough':
        return (
          <del className="text-as-faint line-through" key={index}>
            {token.content}
          </del>
        )
      case 'link':
        return (
          <a
            className="text-as-text underline decoration-as-faint underline-offset-2 transition-colors hover:decoration-as-text"
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

function renderInline(text: string): ReactNode {
  return renderInlineTokens(parseInline(text))
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  switch (block.type) {
    case 'heading':
      return (
        <div
          className={`mt-2 mb-0.5 font-semibold text-as-text first:mt-0 ${
            block.level === 1 ? 'text-[14px]' : 'text-[13px]'
          }`}
          key={index}
        >
          {renderInline(block.text)}
        </div>
      )

    case 'list':
      if (block.ordered) {
        return (
          <ol className="my-1 space-y-1" key={index}>
            {block.items.map((item, itemIdx) => (
              <li className="flex items-start gap-2" key={itemIdx}>
                <span className="shrink-0 select-none pt-px font-mono text-[11px] text-as-faint leading-5">
                  {item.num ?? itemIdx + 1}.
                </span>
                <div className="min-w-0 flex-1">{renderInline(item.text)}</div>
              </li>
            ))}
          </ol>
        )
      }
      return (
        <ul className="my-1 space-y-1" key={index}>
          {block.items.map((item, itemIdx) => (
            <li className="flex items-start gap-2" key={itemIdx}>
              <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-as-faint" />
              <div className="min-w-0 flex-1">{renderInline(item.text)}</div>
            </li>
          ))}
        </ul>
      )

    case 'code_block':
      return <CodeBlock code={block.code} key={index} language={block.language} />

    case 'blockquote':
      return (
        <blockquote className="my-1 pl-3 text-as-muted" key={index}>
          {renderInline(block.text)}
        </blockquote>
      )

    case 'horizontal_rule':
      return <hr className="my-2 border-as-line" key={index} />

    case 'table':
      return (
        <div className="my-1.5 overflow-x-auto rounded-[10px] border border-as-line" key={index}>
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-as-line border-b">
                {block.headers.map((h, hi) => (
                  <th className="px-3 py-1.5 font-semibold text-as-text" key={hi}>
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr className="border-as-line-soft border-b last:border-0" key={ri}>
                  {row.map((cell, ci) => (
                    <td className="px-3 py-1.5 text-as-muted" key={ci}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    default:
      return (
        <p className="my-0.5 first:mt-0 last:mb-0" key={index}>
          {renderInline(block.text)}
        </p>
      )
  }
}

export function ChatMessageContent({
  content,
  speaker = 'assistant',
  className = '',
}: ChatMessageContentProps) {
  if (!content) return null

  // Plain user prompts keep their own line breaks without markdown parsing.
  if (speaker === 'user' && !content.includes('`') && !content.includes('*') && !content.includes('[')) {
    return <div className={`whitespace-pre-wrap break-words ${className}`}>{content}</div>
  }

  const blocks = parseMarkdown(content)

  if (blocks.length === 0) {
    return <div className={`break-words ${className}`}>{renderInline(content)}</div>
  }

  return (
    <div className={`flex flex-col gap-1 break-words ${className}`}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
}
