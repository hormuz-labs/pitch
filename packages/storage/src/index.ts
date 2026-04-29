export async function uploadFile(localPath: string, bucket?: string) {
  const bucketName = bucket || process.env.GCS_BUCKET || 'default-bucket';
  console.log(`[Storage] Uploading ${localPath} to ${bucketName}`);
  // Implementation for @google-cloud/storage would go here
  return `https://storage.googleapis.com/${bucketName}/videos/${Math.random().toString(36).substring(7)}.mp4`;
}
