import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

function getClient(): S3Client {
    if (_client) return _client;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION ?? "us-east-1";
    if (!accessKeyId || !secretAccessKey) {
        throw new Error("S3 credentials not configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)");
    }
    _client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
    });
    return _client;
}

/**
 * Upload a buffer to S3 and return the public URL.
 * The bucket must have public access enabled.
 */
export async function uploadToR2(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
): Promise<string> {
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    const publicUrl = process.env.AWS_S3_PUBLIC_URL?.replace(/\/$/, "");
    if (!bucket || !publicUrl) {
        throw new Error("S3 bucket not configured (AWS_S3_BUCKET_NAME, AWS_S3_PUBLIC_URL)");
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
