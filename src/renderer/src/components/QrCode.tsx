import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface Props {
  value: string
  size?: number
}

export function QrCode({ value, size = 76 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !value) return
    void QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#ffffff', light: '#00000000' }
    })
  }, [value, size])

  return <canvas ref={canvasRef} width={size} height={size} />
}
