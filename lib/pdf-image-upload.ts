/** Bound image size before uploading; the PDF renderer retains the original frames. */
export async function preparePdfImageUpload(file: File, logo = false): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (!file.size || file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('This image could not be opened. Please choose another file.'));
      value.src = source;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 16384 || image.naturalHeight > 16384 || image.naturalWidth * image.naturalHeight > 80_000_000) throw new Error('This image is too large to process. Export a smaller JPG or PNG first.');
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    for (const edge of logo ? [1600, 1200, 900] : [2000, 1600, 1200]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!logo) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Keep transparency for logos; photographs use high-quality JPEG.
      for (const quality of logo ? [1] : [.92, .82, .72]) {
        const result = canvas.toDataURL(logo ? 'image/png' : 'image/jpeg', quality);
        if (result.startsWith('data:image/') && Math.ceil((result.length - result.indexOf(',') - 1) * .75) <= 2 * 1024 * 1024) return result;
      }
    }
    throw new Error('The image is still too large. Please upload a smaller version.');
  } finally { URL.revokeObjectURL(source); }
}
