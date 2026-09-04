/**
 * Filesystem-based object store adapter for local receipt storage.
 * Stores files under a configurable directory with randomized keys.
 * Suitable for local development and single-server deployments.
 */

import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ObjectStore, ObjectStoreObject } from '../../interfaces/objectStore.js'
import { AppError } from '../../../common/errors/appError.js'

export interface FilesystemAdapterOptions {
  /** Base directory where files are stored (e.g., /data/receipts). */
  basePath: string
}

/**
 * Filesystem adapter that stores objects under a local directory.
 * Keys are randomized UUIDs; original filenames are metadata only.
 */
export class FilesystemObjectStoreAdapter implements ObjectStore {
  private basePath: string

  constructor(options: FilesystemAdapterOptions) {
    this.basePath = options.basePath
  }

  async store(input: {
    buffer: Buffer
    originalFilename: string
    mimeType: string
  }): Promise<ObjectStoreObject> {
    try {
      // Ensure base directory exists
      await fs.mkdir(this.basePath, { recursive: true })

      // Generate a randomized key (UUID) to prevent path traversal attacks
      const key = randomUUID()
      const filePath = path.join(this.basePath, key)

      // Compute SHA256 hash of the buffer
      const sha256 = createHash('sha256').update(input.buffer).digest('hex')

      // Write file to filesystem
      await fs.writeFile(filePath, input.buffer)

      return {
        key,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        sha256,
      }
    } catch (error) {
      throw new AppError(
        'STORAGE_WRITE_FAILED',
        `Failed to store file: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 500 },
      )
    }
  }

  async retrieve(key: string): Promise<Buffer> {
    try {
      // Validate the key is a UUID to prevent path traversal (e.g., ../../../etc/passwd)
      if (!this.isValidUuid(key)) {
        throw new AppError(
          'INVALID_STORAGE_KEY',
          'Invalid storage key format',
          { statusCode: 400 },
        )
      }

      const filePath = path.join(this.basePath, key)
      const buffer = await fs.readFile(filePath)
      return buffer
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new AppError(
          'STORAGE_NOT_FOUND',
          'File not found',
          { statusCode: 404 },
        )
      }

      throw new AppError(
        'STORAGE_READ_FAILED',
        `Failed to retrieve file: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 500 },
      )
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // Validate the key is a UUID to prevent path traversal
      if (!this.isValidUuid(key)) {
        throw new AppError(
          'INVALID_STORAGE_KEY',
          'Invalid storage key format',
          { statusCode: 400 },
        )
      }

      const filePath = path.join(this.basePath, key)
      try {
        await fs.unlink(filePath)
      } catch (error) {
        // Idempotent — deleting a non-existent file is not an error
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        'STORAGE_DELETE_FAILED',
        `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 500 },
      )
    }
  }

  /**
   * Validates that a key is a UUID v4 to prevent path traversal attacks.
   */
  private isValidUuid(key: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(key)
  }
}
