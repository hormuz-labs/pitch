import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';

const endpoint = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';
const bucket = process.env.MINIO_BUCKET ?? 'pitch-videos';
const publicUrl = (process.env.MINIO_PUBLIC_URL ?? endpoint).replace(/\/$/, '');

const client = new S3Client({
  endpoint,
  region: 'us-east-1', // MinIO ignores this but the SDK requires a value
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
});

async function ensureBucketExists(bucketName: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch {
    // Bucket doesn't exist — create it
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    // Make the bucket publicly readable so video URLs work without auth
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucketName}/*`,
        },
      ],
    });

    await client.send(
      new PutBucketPolicyCommand({ Bucket: bucketName, Policy: policy })
    );

    console.log(`[Storage] Created public bucket: ${bucketName}`);
  }
}

export async function uploadFile(localPath: string, bucketOverride?: string) {
  const targetBucket = bucketOverride ?? bucket;
  const filename = path.basename(localPath);
  const fileStream = fs.createReadStream(localPath);
  const contentType = localPath.endsWith('.mp4')
    ? 'video/mp4'
    : localPath.endsWith('.wav') || localPath.endsWith('.mp3')
    ? 'audio/mpeg'
    : 'application/octet-stream';

  await ensureBucketExists(targetBucket);

  console.log(`[Storage] Uploading ${filename} to MinIO bucket "${targetBucket}"...`);

  await client.send(
    new PutObjectCommand({
      Bucket: targetBucket,
      Key: filename,
      Body: fileStream,
      ContentType: contentType,
    })
  );

  const url = `${publicUrl}/${targetBucket}/${filename}`;
  console.log(`[Storage] Upload complete. Public URL: ${url}`);
  return url;
}

/**
 * Deletes an object from storage given its public URL.
 * Silently no-ops if the URL doesn't belong to the configured bucket.
 */
export async function deleteFile(publicFileUrl: string, bucketOverride?: string): Promise<void> {
  const targetBucket = bucketOverride ?? bucket;
  // Extract the key — URL format is: <publicUrl>/<bucket>/<key>
  const prefix = `${publicUrl}/${targetBucket}/`;
  if (!publicFileUrl.startsWith(prefix)) {
    console.warn(`[Storage] deleteFile: URL does not match expected prefix, skipping. URL: ${publicFileUrl}`);
    return;
  }
  const key = publicFileUrl.slice(prefix.length);
  await client.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: key }));
  console.log(`[Storage] Deleted object: ${key} from bucket "${targetBucket}"`);
}
