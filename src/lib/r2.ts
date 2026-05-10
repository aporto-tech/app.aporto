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

export function artifactRetentionDays(): number {
    const days = Number(process.env.ARTIFACT_RETENTION_DAYS ?? 30);
    return Number.isFinite(days) && days > 0 ? days : 30;
}

export function artifactExpiresAt(from = new Date()): Date {
    return new Date(from.getTime() + artifactRetentionDays() * 24 * 60 * 60 * 1000);
}

/**
 * Upload a buffer to S3 and return the public URL.
 * The bucket must have public access enabled.
 */
export async function uploadToR2(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    options: { expiresAt?: Date } = {},
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
            Expires: options.expiresAt ?? artifactExpiresAt(),
        }),
    );
    return `${publicUrl}/${key}`;
}

export async function copyUrlToR2(
    sourceUrl: string,
    key: string,
    fallbackContentType: string,
): Promise<string> {
    const res = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch generated artifact: ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? fallbackContentType;
    const body = Buffer.from(await res.arrayBuffer());
    return uploadToR2(key, body, contentType);
}
