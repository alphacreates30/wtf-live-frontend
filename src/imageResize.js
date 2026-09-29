// Shrinks a photo in the browser before upload, by redrawing it on a canvas. A canvas carries no metadata, so the
// upload also loses the photo's EXIF - including GPS, which on a phone photo is often where it was taken. The
// server strips metadata again on every upload; this keeps it off the wire too.
// PNG and WebP keep their format (transparency); everything else becomes JPEG. The blob's own type is what to
// upload it as.
export function resizeImageToBlob(file, maxEdge = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objUrl)
      let { width, height } = img
      if (width > maxEdge || height > maxEdge) {
        if (width > height) { height = Math.round(height * maxEdge / width); width = maxEdge }
        else { width = Math.round(width * maxEdge / height); height = maxEdge }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Image conversion failed'))
        resolve(blob)
      }, type, quality)
    }
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Could not read that image')) }
    img.src = objUrl
  })
}
