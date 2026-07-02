import { useState, useCallback, useEffect } from 'react'
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

function isPdfUrl(url: string) {
  return url.includes('.pdf') || url.includes('application/pdf') || url.startsWith('data:application/pdf')
}

function isImageUrl(url: string) {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) || url.startsWith('data:image/')
}

interface MediaPreviewProps {
  url: string | null
  fileName?: string | null
  onClose: () => void
  allUrls?: string[]
  initialIndex?: number
}

export default function MediaPreview({ url, fileName, onClose, allUrls, initialIndex = 0 }: MediaPreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [loadError, setLoadError] = useState(false)

  const urls = allUrls && allUrls.length > 0 ? allUrls : url ? [url] : []
  const currentUrl = urls[currentIndex] ?? null
  const isPdf = currentUrl ? isPdfUrl(currentUrl) : false
  const isImage = currentUrl ? isImageUrl(currentUrl) : false

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(0, i - 1))
    if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(urls.length - 1, i + 1))
  }, [onClose, urls.length])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  if (!currentUrl) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
      >
        <X size={24} />
      </button>

      {/* Download button */}
      <a
        href={currentUrl}
        download={fileName || 'arquivo'}
        target="_blank"
        rel="noreferrer"
        className="absolute right-16 top-4 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
        title="Download"
      >
        <Download size={24} />
      </a>

      {/* Navigation */}
      {urls.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              type="button"
              onClick={() => setCurrentIndex(i => i - 1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
            >
              <ChevronLeft size={32} />
            </button>
          )}
          {currentIndex < urls.length - 1 && (
            <button
              type="button"
              onClick={() => setCurrentIndex(i => i + 1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
            >
              <ChevronRight size={32} />
            </button>
          )}
          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === currentIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/70',
                )}
              />
            ))}
          </div>
        </>
      )}

      {/* Content */}
      {isImage && !loadError ? (
        <div className="flex max-h-[90vh] max-w-[90vw] items-center justify-center">
          <img
            src={currentUrl}
            alt={fileName || 'imagem'}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onError={() => setLoadError(true)}
          />
        </div>
      ) : isPdf ? (
        <div className="flex h-[90vh] w-[90vw] flex-col rounded-lg bg-white">
          <div className="flex items-center justify-between border-b px-4 py-2 text-sm text-gray-600">
            <span className="truncate">{fileName || 'documento.pdf'}</span>
          </div>
          <embed
            src={currentUrl}
            type="application/pdf"
            className="h-full w-full rounded-b-lg"
            onError={() => setLoadError(true)}
          />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-white p-8 text-gray-600">
          <p className="text-lg font-medium">Nao foi possivel carregar o arquivo</p>
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition-colors"
          >
            Abrir em nova aba
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-white p-8 text-gray-600">
          <p className="text-lg font-medium">{fileName || 'Arquivo'}</p>
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition-colors"
          >
            Abrir em nova aba
          </a>
        </div>
      )}
    </div>
  )
}
