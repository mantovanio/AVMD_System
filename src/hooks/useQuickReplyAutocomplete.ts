import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl } from '../lib/api'

export interface QuickReplyAttachment {
  url: string
  filename: string
  mime_type: string
  size?: number
}

export interface QuickReply {
  id: string
  shortcut: string
  name: string
  body: string
  category: string | null
  attachments: QuickReplyAttachment[]
  ativo: boolean
}

interface UseQuickReplyAutocompleteOptions {
  enabled?: boolean
}

export function useQuickReplyAutocomplete(options?: UseQuickReplyAutocompleteOptions) {
  const { enabled = true } = options ?? {}
  const [allReplies, setAllReplies] = useState<QuickReply[]>([])
  const [filtered, setFiltered] = useState<QuickReply[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [triggerText, setTriggerText] = useState('')
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!enabled || loadedRef.current) return
    loadedRef.current = true
    void fetch(getApiUrl('/api/chat/quick-replies'))
      .then(r => r.json())
      .then((data: { ok: boolean; replies?: QuickReply[] }) => {
        if (data.ok && data.replies) setAllReplies(data.replies.filter(r => r.ativo))
      })
      .catch(() => {})
  }, [enabled])

  const analyzeInput = useCallback((value: string, cursorPos: number) => {
    if (!enabled) return

    const textBeforeCursor = value.substring(0, cursorPos)
    const slashMatch = textBeforeCursor.match(/\\([a-zA-Z0-9_-]*)$/)

    if (slashMatch) {
      const term = slashMatch[1].toLowerCase()
      setTriggerText(term)
      const matches = allReplies.filter(r =>
        r.shortcut.toLowerCase().includes(term) ||
        r.name.toLowerCase().includes(term)
      )
      setFiltered(matches.slice(0, 10))
      setSelectedIndex(0)
      setIsOpen(matches.length > 0)
    } else {
      setIsOpen(false)
      setTriggerText('')
    }
  }, [enabled, allReplies])

  const selectReply = useCallback((reply: QuickReply): { text: string; attachments: QuickReplyAttachment[] } | null => {
    setIsOpen(false)
    setTriggerText('')
    return {
      text: reply.body,
      attachments: reply.attachments,
    }
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent, currentValue: string, cursorPos: number): { reply: QuickReply } | null => {
    if (!isOpen) return null

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1))
      return null
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
      return null
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      if (filtered.length === 0) return null
      event.preventDefault()
      const reply = filtered[selectedIndex]
      if (!reply) return null
      setIsOpen(false)
      setTriggerText('')
      return { reply }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      setTriggerText('')
      return null
    }
    return null
  }, [isOpen, filtered, selectedIndex])

  const replaceTriggerText = useCallback((fullText: string, cursorPos: number, replacement: string): { text: string; newCursorPos: number } => {
    const textBeforeCursor = fullText.substring(0, cursorPos)
    const textAfterCursor = fullText.substring(cursorPos)
    const slashMatch = textBeforeCursor.match(/\\[a-zA-Z0-9_-]*$/)
    if (!slashMatch) return { text: fullText, newCursorPos: cursorPos }

    const matchStart = textBeforeCursor.length - slashMatch[0].length
    const newText = fullText.substring(0, matchStart) + replacement + textAfterCursor
    const newCursorPos = matchStart + replacement.length
    return { text: newText, newCursorPos }
  }, [])

  return {
    filtered,
    isOpen,
    selectedIndex,
    analyzeInput,
    selectReply,
    handleKeyDown,
    replaceTriggerText,
    setSelectedIndex,
  }
}
