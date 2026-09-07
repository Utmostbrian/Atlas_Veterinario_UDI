const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

/**
 * Downscales/recompresses an image file to keep the base64 payload well under
 * the anthropic-proxy edge function's per-message byte limit. Animated GIFs
 * are passed through untouched since canvas re-encoding would drop frames.
 */
export function resizeImageFile(file) {
  return new Promise(resolve => {
    if (!file || file.type === 'image/gif') {
      resolve(file)
      return
    }

    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}
