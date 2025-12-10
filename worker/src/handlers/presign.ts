import type { Context } from 'hono';
import { AwsClient } from 'aws4fetch';
import type { Env, PresignRequest, PresignResponse } from '../types';
import { successResponse, errorResponse } from '../utils/response';
import { generateImageId, parseTags } from '../utils/validation';
import { ImageProcessor } from '../services/imageProcessor';

// Maximum file size for presigned upload: 5GB (R2 single PUT limit)
const MAX_PRESIGN_SIZE = 5 * 1024 * 1024 * 1024;

// Expiry time for presigned URL: 1 hour
const PRESIGN_EXPIRY = 3600;

/**
 * Generate a presigned URL for direct R2 upload
 * Used for files >= 100MB to bypass Worker request body limit
 */
export async function presignHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<PresignRequest>();
    const { filename, contentType, size } = body;

    // Validate required fields
    if (!filename || !contentType || !size) {
      return errorResponse('Missing required fields: filename, contentType, size');
    }

    // Validate file size
    if (size > MAX_PRESIGN_SIZE) {
      return errorResponse(`File too large. Maximum size is ${MAX_PRESIGN_SIZE / 1024 / 1024 / 1024}GB`, 413);
    }

    // Validate content type is an image
    if (!contentType.startsWith('image/')) {
      return errorResponse('Only image files are allowed');
    }

    // Validate format is supported
    const format = ImageProcessor.getFormatFromMimeType(contentType);
    if (!format || !ImageProcessor.isSupportedFormat(format)) {
      return errorResponse(`Unsupported image format: ${contentType}`);
    }

    // Check if R2 API credentials are configured
    if (!c.env.R2_ACCESS_KEY_ID || !c.env.R2_SECRET_ACCESS_KEY || !c.env.R2_ACCOUNT_ID || !c.env.R2_BUCKET_NAME) {
      console.error('R2 API credentials not configured');
      return errorResponse('Presigned upload is not available', 503);
    }

    // Generate unique ID and temp key
    const id = generateImageId();
    const key = `temp/${id}/${filename}`;

    // Create AWS client for R2
    const client = new AwsClient({
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    });

    // Build R2 URL
    const r2Url = new URL(
      `https://${c.env.R2_BUCKET_NAME}.${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`
    );

    // Add expiry parameter
    r2Url.searchParams.set('X-Amz-Expires', PRESIGN_EXPIRY.toString());

    // Sign the request
    const signedRequest = await client.sign(
      new Request(r2Url.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
      }),
      {
        aws: { signQuery: true },
      }
    );

    const response: PresignResponse = {
      uploadUrl: signedRequest.url,
      key,
      id,
      expiresIn: PRESIGN_EXPIRY,
    };

    console.log(`Generated presigned URL for: ${filename}, id: ${id}, size: ${size}`);

    return successResponse(response);
  } catch (err) {
    console.error('Presign error:', err);
    return errorResponse('Failed to generate presigned URL');
  }
}
