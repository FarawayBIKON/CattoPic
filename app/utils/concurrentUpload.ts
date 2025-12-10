import { request } from './request'
import { UploadResult } from '../types'
import { FileUploadStatus } from '../types/upload'

// Threshold for using presigned URL upload (100MB)
const PRESIGN_UPLOAD_THRESHOLD = 100 * 1024 * 1024

interface SingleUploadResponse {
  success: boolean
  result: UploadResult
  error?: string
}

interface PresignResponse {
  uploadUrl: string
  key: string
  id: string
  expiresIn: number
}

interface ConfirmResponse {
  success: boolean
  result: UploadResult
  error?: string
}

export interface ConcurrentUploadOptions {
  files: { id: string; file: File }[]
  concurrency?: number
  tags: string[]
  expiryMinutes: number
  quality: number
  maxWidth: number
  preserveAnimation: boolean
  onFileStatusChange: (fileId: string, status: FileUploadStatus, result?: UploadResult) => void
  signal?: AbortSignal
}

/**
 * Upload files concurrently with controlled parallelism
 * Each file is uploaded as a separate request for individual progress tracking
 */
export async function concurrentUpload(options: ConcurrentUploadOptions): Promise<UploadResult[]> {
  const {
    files,
    concurrency = 5,
    tags,
    expiryMinutes,
    quality,
    maxWidth,
    preserveAnimation,
    onFileStatusChange,
    signal,
  } = options

  const results: UploadResult[] = []
  const queue = [...files]
  const active: Promise<void>[] = []

  /**
   * Upload a large file via presigned URL
   */
  async function uploadLargeFile(item: { id: string; file: File }): Promise<void> {
    // 1. Get presigned URL
    const presignResponse = await request<PresignResponse>('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: item.file.name,
        contentType: item.file.type,
        size: item.file.size,
      }),
      signal,
    })

    if (!presignResponse.uploadUrl) {
      throw new Error('Failed to get presigned URL')
    }

    // 2. Upload directly to R2
    const uploadResponse = await fetch(presignResponse.uploadUrl, {
      method: 'PUT',
      body: item.file,
      headers: {
        'Content-Type': item.file.type,
      },
      signal,
    })

    if (!uploadResponse.ok) {
      throw new Error(`Direct upload failed: ${uploadResponse.status}`)
    }

    // Update to processing (compression phase)
    onFileStatusChange(item.id, 'processing')

    // 3. Confirm upload and trigger compression
    const confirmResponse = await request<ConfirmResponse>('/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: presignResponse.key,
        id: presignResponse.id,
        tags: tags.join(','),
        expiryMinutes,
        quality,
        maxWidth,
      }),
      signal,
    })

    if (confirmResponse.success && confirmResponse.result) {
      onFileStatusChange(item.id, 'success', confirmResponse.result)
      results.push(confirmResponse.result)
    } else {
      throw new Error(confirmResponse.error || 'Confirm upload failed')
    }
  }

  /**
   * Upload a regular file via Worker
   */
  async function uploadRegularFile(item: { id: string; file: File }): Promise<void> {
    // Build FormData for single file
    const formData = new FormData()
    formData.append('image', item.file)
    formData.append('tags', tags.join(','))
    formData.append('expiryMinutes', expiryMinutes.toString())
    formData.append('quality', quality.toString())
    formData.append('maxWidth', maxWidth.toString())
    formData.append('preserveAnimation', preserveAnimation.toString())

    // Update to processing (after upload starts, before compression completes)
    onFileStatusChange(item.id, 'processing')

    const response = await request<SingleUploadResponse>('/api/upload/single', {
      method: 'POST',
      body: formData,
      signal,
    })

    if (response.success && response.result) {
      onFileStatusChange(item.id, 'success', response.result)
      results.push(response.result)
    } else {
      throw new Error(response.error || 'Upload failed')
    }
  }

  async function uploadOne(item: { id: string; file: File }): Promise<void> {
    // Check if cancelled
    if (signal?.aborted) {
      return
    }

    // Update status to uploading
    onFileStatusChange(item.id, 'uploading')

    try {
      // Choose upload method based on file size
      if (item.file.size >= PRESIGN_UPLOAD_THRESHOLD) {
        console.log(`Large file detected (${(item.file.size / 1024 / 1024).toFixed(1)}MB), using presigned URL upload`)
        await uploadLargeFile(item)
      } else {
        await uploadRegularFile(item)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Upload was cancelled
        return
      }

      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      const errorResult: UploadResult = {
        id: '',
        status: 'error',
        error: errorMessage,
      }
      onFileStatusChange(item.id, 'error', errorResult)
      results.push(errorResult)
    }
  }

  // Concurrent upload with controlled parallelism
  while (queue.length > 0 || active.length > 0) {
    // Check if cancelled
    if (signal?.aborted) {
      break
    }

    // Fill up to concurrency limit
    while (active.length < concurrency && queue.length > 0) {
      const item = queue.shift()!
      const promise = uploadOne(item).finally(() => {
        const index = active.indexOf(promise)
        if (index > -1) {
          active.splice(index, 1)
        }
      })
      active.push(promise)
    }

    // Wait for any one to complete
    if (active.length > 0) {
      await Promise.race(active)
    }
  }

  return results
}
