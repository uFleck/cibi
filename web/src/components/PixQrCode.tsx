import { useEffect, useRef } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { copyToClipboard } from '@/lib/clipboard'
import { generatePixPayload } from '@/lib/pix-qrcode'

interface PixQrCodeProps {
  pixKey: string
  amount?: number
  merchantName?: string
  city?: string
  size?: number
}

export function PixQrCode({ pixKey, amount, merchantName, city, size = 200 }: PixQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const payload = generatePixPayload(pixKey, amount, merchantName, city)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    const render = async () => {
      const QRCode = (await import('qrcode')).default
      if (cancelled) return
      // Use dark/light to respect theme
      QRCode.toCanvas(canvas, payload, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      })
    }

    render()

    return () => {
      cancelled = true
    }
  }, [payload, size])

  const handleCopy = async () => {
    const ok = await copyToClipboard(payload)
    if (ok) toast.success('PIX copia e cola copied')
    else toast.error('Failed to copy PIX code')
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-lg border border-border"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="w-full"
      >
        <Copy size={14} />
        Copy PIX code
      </Button>
    </div>
  )
}
