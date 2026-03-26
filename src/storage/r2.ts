import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pack } from 'tar-stream';
import { config } from '../config.js';
import type { PageResult, UploadResult } from '../types.js';

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

/**
 * Create a tar.gz archive of multiple markdown files
 */
async function createTarGz(
  pages: PageResult[],
  markdowns: string[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tarStream = pack();
    const chunks: Buffer[] = [];

    tarStream.on('data', (chunk) => chunks.push(chunk));
    tarStream.on('end', () => resolve(Buffer.concat(chunks)));
    tarStream.on('error', reject);

    // Add each markdown file to the tar
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const markdown = markdowns[i];

      // Create a safe filename from the URL
      const urlObj = new URL(page.url);
      const filename =
        urlObj.pathname === '/' || urlObj.pathname === ''
          ? 'index.md'
          : urlObj.pathname
              .replace(/^\//, '')
              .replace(/\//g, '_')
              .replace(/[^a-zA-Z0-9_-]/g, '-') + '.md';

      tarStream.entry(
        {
          name: `pages/${filename}`,
        },
        markdown,
      );
    }

    // Add index/manifest file
    const manifest = {
      generatedAt: new Date().toISOString(),
      totalPages: pages.length,
      pages: pages.map((page, i) => ({
        url: page.url,
        title: page.title,
        filename: `pages/${i}.md`,
      })),
    };

    tarStream.entry(
      { name: 'manifest.json' },
      JSON.stringify(manifest, null, 2),
    );

    tarStream.finalize();
  });
}

/**
 * Upload crawl results to R2
 * For single-page results, returns inline (not uploaded)
 * For multi-page results, creates tar.gz and uploads to R2
 */
export async function uploadResult(
  jobId: string,
  pages: PageResult[],
  markdowns: string[],
): Promise<UploadResult | null> {
  // Single page - don't upload to R2, return inline
  if (pages.length === 1) {
    console.log(`Single page result - storing inline (not uploading to R2)`);
    return null;
  }

  console.log(`Uploading ${pages.length} pages to R2 for job ${jobId}`);

  try {
    // Create tar.gz archive
    const tarBuffer = await createTarGz(pages, markdowns);

    // Upload to R2
    const key = `results/${jobId}.tar.gz`;
    const uploadCommand = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: tarBuffer,
      ContentType: 'application/gzip',
      Metadata: {
        jobId,
        pageCount: pages.length.toString(),
      },
    });

    await s3Client.send(uploadCommand);

    // Generate signed URL (valid for 24 hours)
    const expiresIn = 24 * 60 * 60; // 24 hours
    const getCommand = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, getCommand, { expiresIn });

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    console.log(`✓ Uploaded to R2: ${key} (${tarBuffer.length} bytes)`);

    return {
      key,
      url,
      expiresAt,
    };
  } catch (error) {
    console.error('Failed to upload to R2:', error);
    throw new Error(`R2 upload failed: ${(error as Error).message}`);
  }
}

/**
 * Test R2 connection
 */
export async function testR2Connection(): Promise<boolean> {
  try {
    // Try to list objects (just check if we can connect)
    const testKey = `test/${Date.now()}.txt`;
    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: testKey,
      Body: 'test',
    });

    await s3Client.send(command);
    console.log('✓ R2 connection successful');
    return true;
  } catch (error) {
    console.error('✗ R2 connection failed:', error);
    return false;
  }
}
