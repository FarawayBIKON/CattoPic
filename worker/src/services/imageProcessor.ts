// Image Processor Service
// Note: Full WebP/AVIF conversion requires photon-rs WASM or Cloudflare Image Resizing
// This is a basic implementation that handles format detection and orientation

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  orientation: 'landscape' | 'portrait';
}

export class ImageProcessor {
  // Detect image format from magic bytes
  static detectFormat(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data.slice(0, 12));

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'png';
    }

    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'gif';
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'webp';
    }

    // AVIF: Check for ftyp box with avif brand
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (brand === 'avif' || brand === 'avis') {
        return 'avif';
      }
    }

    return 'unknown';
  }

  // Get image dimensions (basic implementation for JPEG and PNG)
  static async getImageDimensions(data: ArrayBuffer): Promise<{ width: number; height: number }> {
    const bytes = new Uint8Array(data);
    const format = this.detectFormat(data);

    switch (format) {
      case 'png':
        return this.getPngDimensions(bytes);
      case 'jpeg':
        return this.getJpegDimensions(bytes);
      case 'gif':
        return this.getGifDimensions(bytes);
      default:
        // Default fallback
        return { width: 1920, height: 1080 };
    }
  }

  private static getPngDimensions(bytes: Uint8Array): { width: number; height: number } {
    // PNG stores dimensions at byte 16-23 in big-endian
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  private static getJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
    // JPEG dimensions are in SOF markers
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xFF) {
        i++;
        continue;
      }

      const marker = bytes[i + 1];

      // SOF markers (Start of Frame)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return { width, height };
      }

      // Skip to next marker
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + length;
    }

    return { width: 1920, height: 1080 };
  }

  private static getGifDimensions(bytes: Uint8Array): { width: number; height: number } {
    // GIF dimensions at bytes 6-9 in little-endian
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return { width, height };
  }

  // Detect orientation based on dimensions
  static detectOrientation(width: number, height: number): 'landscape' | 'portrait' {
    return width >= height ? 'landscape' : 'portrait';
  }

  // Get full image info
  static async getImageInfo(data: ArrayBuffer): Promise<ImageInfo> {
    const format = this.detectFormat(data);
    const { width, height } = await this.getImageDimensions(data);
    const orientation = this.detectOrientation(width, height);

    return { width, height, format, orientation };
  }

  // Get content type for format
  static getContentType(format: string): string {
    const types: Record<string, string> = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      avif: 'image/avif'
    };
    return types[format] || 'application/octet-stream';
  }

  // Get file extension for format
  static getExtension(format: string): string {
    const extensions: Record<string, string> = {
      jpeg: 'jpg',
      jpg: 'jpg',
      png: 'png',
      gif: 'gif',
      webp: 'webp',
      avif: 'avif'
    };
    return extensions[format] || format;
  }

  // Check if format is supported
  static isSupportedFormat(format: string): boolean {
    const supported = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif'];
    return supported.includes(format.toLowerCase());
  }

  // Get format from MIME type
  static getFormatFromMimeType(mimeType: string): string | null {
    const mimeToFormat: Record<string, string> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/avif': 'avif',
    };
    return mimeToFormat[mimeType.toLowerCase()] || null;
  }

  // Validate file size
  static isValidFileSize(size: number, maxSize: number = 10 * 1024 * 1024): boolean {
    return size <= maxSize;
  }
}
