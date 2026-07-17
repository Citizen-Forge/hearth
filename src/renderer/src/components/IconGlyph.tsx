interface Props {
  icon?: string
  fallback?: string
  size?: number
}

/** Renders an emoji/text icon, or an <img> if the value is a data: URL (a real extracted app icon). */
export function IconGlyph({ icon, fallback = '📦', size = 22 }: Props) {
  if (icon?.startsWith('data:')) {
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 4 }} />
  }
  return <>{icon ?? fallback}</>
}
