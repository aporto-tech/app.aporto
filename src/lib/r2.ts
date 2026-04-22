import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

function getClient(): S3Client {
    if (_client) return _client;
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error("R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
    }
    _client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    return _client;
}

/**
 * Upload a buffer to R2 and return the public URL.
 * The bucket must have public access enabled.
 */
export async function uploadToR2(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
): Promise<string> {
    const bucket = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (!bucket || !publicUrl) {
        throw new Error("R2 bucket not configured (R2_BUCKET_NAME, R2_PUBLIC_URL)");
    }
    await getClient().send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }),
    );
    return `${publicUrl}/${key}`;
}
