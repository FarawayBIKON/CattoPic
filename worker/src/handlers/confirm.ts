import type { Context } from 'hono';
import type { Env, ConfirmRequest, ImageMetadata, UploadResult, CompressionOptions } from '../types';
import { StorageService } from '../services/storage';
import { MetadataService } from '../services/metadata';
import { CacheService } from '../services/cache';
import { ImageProcessor } from '../services/imageProcessor';
import { CompressionService } from '../services/compression';
import { successResponse, errorResponse } from '../utils/response';
import { parseTags } from '../utils/validation';

// Maximum file size for compression: 70MB (Cloudflare Image Resizing limit)
const MAX_COMPRESSION_SIZE = 70 * 1024 * 1024;

/**
 * Confirm upload and process the image
 * Called after client uploads directly to R2 via presigned URL
 */
export async function confirmHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<ConfirmRequest>();
    const { key, id, tags: tagsString, expiryMinutes, quality, maxWidth, maxHeight } = body;

    // Validate required fields
    if (!key || !id) {
      return errorResponse('Missing required fields: key, id');
    }

    console.log(`Processing confirmed upload: key=${key}, id=${id}`);

    const storage = new StorageService(c.env.R2_BUCKET);
    const metadata = new MetadataService(c.env.DB);
    const compression = c.env.IMAGES ? new CompressionService(c.env.IMAGES) : null;

    // 1. Read uploaded file from R2 temp location
    const object = await storage.get(key);
    if (!object) {
      return errorResponse('Uploaded file not found. It may have expired.', 404);
    }

    const arrayBuffer = await object.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    console.log(`Retrieved file: ${key}, size: ${fileSize} bytes`);

    // 2. Get image info
    const imageInfo = await ImageProcessor.getImageInfo(arrayBuffer);

    if (!ImageProcessor.isSupportedFormat(imageInfo.format)) {
      // Clean up temp file
      await storage.delete(key);
      return errorResponse(`Unsupported format: ${imageInfo.format}`);
    }

    // 3. Generate paths
    const paths = StorageService.generatePaths(id, imageInfo.orientation, imageInfo.format);
    const contentType = ImageProcessor.getContentType(imageInfo.format);
    const tags = parseTags(tagsString ?? null);
    const isGif = imageInfo.format === 'gif';

    let webpSize = 0;
    let avifSize = 0;

    // 4. Process and upload to final location
    if (!isGif && compression && fileSize <= MAX_COMPRESSION_SIZE) {
      // File is within compression limit: compress and upload
      const compressionOptions: CompressionOptions = {
        quality: quality ?? 90,
        maxWidth: maxWidth ?? 3840,
        maxHeight: maxHeight ?? 3840,
        preserveAnimation: true,
      };

      // Upload original and compress in parallel
      const [, compressionResult] = await Promise.all([
        storage.upload(paths.original, arrayBuffer, contentType),
        compression.compress(arrayBuffer, imageInfo.format, compressionOptions),
      ]);

      // Upload compressed versions in parallel
      const uploadPromises: Promise<void>[] = [];

      if (compressionResult.webp) {
        uploadPromises.push(
          storage.upload(paths.webp, compressionResult.webp.data, 'image/webp')
            .then(() => { webpSize = compressionResult.webp!.size; })
        );
      } else {
        uploadPromises.push(
          storage.upload(paths.webp, arrayBuffer, contentType)
            .then(() => { webpSize = fileSize; })
        );
      }

      if (compressionResult.avif) {
        uploadPromises.push(
          storage.upload(paths.avif, compressionResult.avif.data, 'image/avif')
            .then(() => { avifSize = compressionResult.avif!.size; })
        );
      } else {
        uploadPromises.push(
          storage.upload(paths.avif, arrayBuffer, contentType)
            .then(() => { avifSize = fileSize; })
        );
      }

      await Promise.all(uploadPromises);

      console.log(`Compressed: webp=${webpSize}, avif=${avifSize}`);

    } else if (!isGif && fileSize > MAX_COMPRESSION_SIZE) {
      // File exceeds compression limit: upload original and fallback copies
      console.log(`File exceeds ${MAX_COMPRESSION_SIZE / 1024 / 1024}MB limit, skipping compression`);

      await Promise.all([
        storage.upload(paths.original, arrayBuffer, contentType),
        storage.upload(paths.webp, arrayBuffer, contentType).then(() => { webpSize = fileSize; }),
        storage.upload(paths.avif, arrayBuffer, contentType).then(() => { avifSize = fileSize; }),
      ]);

    } else if (!isGif && !compression) {
      // No compression service: upload original and fallback copies
      await Promise.all([
        storage.upload(paths.original, arrayBuffer, contentType),
        storage.upload(paths.webp, arrayBuffer, contentType).then(() => { webpSize = fileSize; }),
        storage.upload(paths.avif, arrayBuffer, contentType).then(() => { avifSize = fileSize; }),
      ]);

    } else {
      // GIF: only upload original
      await storage.upload(paths.original, arrayBuffer, contentType);
    }

    // 5. Delete temp file
    await storage.delete(key);
    console.log(`Deleted temp file: ${key}`);

    // 6. Calculate expiry time
    let expiryTime: string | undefined;
    if (expiryMinutes && expiryMinutes > 0) {
      const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
      expiryTime = expiry.toISOString();
    }

    // 7. Save metadata
    const imageMetadata: ImageMetadata = {
      id,
      originalName: key.split('/').pop() || id,
      uploadTime: new Date().toISOString(),
      expiryTime,
      orientation: imageInfo.orientation,
      tags,
      format: imageInfo.format,
      width: imageInfo.width,
      height: imageInfo.height,
      paths,
      sizes: {
        original: fileSize,
        webp: webpSize,
        avif: avifSize,
      },
    };

    await metadata.saveImage(imageMetadata);

    // 8. Build result
    const baseUrl = c.env.R2_PUBLIC_URL;
    const result: UploadResult = {
      id,
      status: 'success',
      urls: {
        original: `${baseUrl}/${paths.original}`,
        webp: isGif ? '' : `${baseUrl}/${paths.webp}`,
        avif: isGif ? '' : `${baseUrl}/${paths.avif}`,
      },
      orientation: imageInfo.orientation,
      tags,
      sizes: imageMetadata.sizes,
      expiryTime,
      format: imageInfo.format,
    };

    // 9. Invalidate caches (non-blocking)
    const cache = new CacheService(c.env.CACHE_KV);
    c.executionCtx.waitUntil(
      Promise.all([
        cache.invalidateImagesList(),
        cache.invalidateTagsList(),
      ])
    );

    console.log(`Upload confirmed: id=${id}, format=${imageInfo.format}, orientation=${imageInfo.orientation}`);

    return successResponse({ result });
  } catch (err) {
    console.error('Confirm upload error:', err);
    return errorResponse('Failed to confirm upload');
  }
}
