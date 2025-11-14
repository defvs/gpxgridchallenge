import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

const normalizeKey = (key: string) => key.replace(/^\/+/, "");

const splitKeySegments = (key: string) => normalizeKey(key).split("/").filter(Boolean);

const toLocalPath = (key: string) => path.join(STORAGE_ROOT, ...splitKeySegments(key));

const getParentKey = (key: string) => {
  const normalized = normalizeKey(key);
  const parent = path.posix.dirname(normalized);
  return parent === "." ? "" : parent;
};

type StorageDriver = "local" | "bucket";

const driverEnv = (process.env.STORAGE_DRIVER as StorageDriver | undefined)?.toLowerCase();
const bucketName = process.env.STORAGE_BUCKET_NAME;
const bucketPrefix = process.env.STORAGE_BUCKET_PREFIX?.replace(/^\/+|\/+$/g, "");
const bucketRegion = process.env.STORAGE_BUCKET_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const bucketEndpoint = process.env.STORAGE_BUCKET_ENDPOINT;
const bucketAccessKeyId = process.env.STORAGE_BUCKET_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
const bucketSecretAccessKey = process.env.STORAGE_BUCKET_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
const bucketSessionToken = process.env.STORAGE_BUCKET_SESSION_TOKEN ?? process.env.AWS_SESSION_TOKEN;
const rawForcePathStyle = process.env.STORAGE_BUCKET_FORCE_PATH_STYLE;
const inferredDriver = bucketName && bucketAccessKeyId && bucketSecretAccessKey ? "bucket" : "local";
const useBucketDriver =
  driverEnv === "bucket" || (!driverEnv && inferredDriver === "bucket");
const driver: StorageDriver = useBucketDriver ? "bucket" : "local";

const usePathStyle = rawForcePathStyle ? rawForcePathStyle === "true" : Boolean(bucketEndpoint);

const endpointUrl = (() => {
  if (driver !== "bucket") {
    return null;
  }

  const endpoint = bucketEndpoint ? bucketEndpoint : `https://s3.${bucketRegion}.amazonaws.com`;
  try {
    return new URL(endpoint);
  } catch (error) {
    throw new Error(`Invalid STORAGE_BUCKET_ENDPOINT: ${(error as Error).message}`);
  }
})();

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "%20");

const buildEncodedKey = (key: string) => splitKeySegments(key).map(encodeRfc3986).join("/");

const buildBucketKey = (key: string) => {
  const normalized = normalizeKey(key);
  const withPrefix = bucketPrefix ? `${bucketPrefix}/${normalized}` : normalized;
  return buildEncodedKey(withPrefix);
};

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const getSigningKey = (dateStamp: string) => {
  if (!bucketSecretAccessKey) {
    throw new Error("Missing STORAGE_BUCKET_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY");
  }

  const kDate = createHmac("sha256", `AWS4${bucketSecretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(bucketRegion).digest();
  const kService = createHmac("sha256", kRegion).update("s3").digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
};

const formatAmzDate = (date: Date) => date.toISOString().replace(/[-:]|\..+/g, "");

const sendBucketRequest = async (
  method: "GET" | "PUT" | "DELETE",
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> => {
  if (!bucketName) {
    throw new Error("Missing STORAGE_BUCKET_NAME for bucket storage");
  }
  if (!bucketAccessKeyId || !bucketSecretAccessKey) {
    throw new Error(
      "Missing STORAGE_BUCKET_ACCESS_KEY_ID/SECRET or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY for bucket storage",
    );
  }
  if (!endpointUrl) {
    throw new Error("Bucket endpoint is not configured");
  }

  const encodedKey = buildBucketKey(key);
  const url = new URL(endpointUrl.toString());
  if (usePathStyle) {
    url.pathname = `/${bucketName}/${encodedKey}`;
  } else {
    url.hostname = `${bucketName}.${url.hostname}`;
    url.pathname = `/${encodedKey}`;
  }

  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256(payload);
  const signingHeaders: Record<string, string> = {
    host: url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };

  if (bucketSessionToken) {
    signingHeaders["x-amz-security-token"] = bucketSessionToken;
  }
  if (contentType) {
    signingHeaders["content-type"] = contentType;
  }

  const sortedHeaderNames = Object.keys(signingHeaders).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${signingHeaders[name].trim()}`).join("\n");
  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalUri = usePathStyle ? `/${bucketName}/${encodedKey}` : `/${encodedKey}`;
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${bucketRegion}/s3/aws4_request`;
  const stringToSign = [`AWS4-HMAC-SHA256`, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signingKey = getSigningKey(dateStamp);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${bucketAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = new Headers();
  Object.entries(signingHeaders).forEach(([name, value]) => {
    if (name !== "host") {
      requestHeaders.set(name, value);
    }
  });
  requestHeaders.set("authorization", authorization);

  const requestBody: BodyInit | null | undefined = payload.length ? new Uint8Array(payload) : undefined;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  return response;
};

const bucketRead = async (key: string): Promise<Buffer> => {
  const response = await sendBucketRequest("GET", key);
  if (response.status === 404) {
    const error = new Error("Object not found") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bucket read failed with ${response.status}: ${text}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const bucketWrite = async (key: string, content: string | Buffer, contentType?: string) => {
  const payload = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const response = await sendBucketRequest("PUT", key, payload, contentType);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bucket write failed with ${response.status}: ${text}`);
  }
};

const bucketDelete = async (key: string) => {
  const response = await sendBucketRequest("DELETE", key);
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Bucket delete failed with ${response.status}: ${text}`);
  }
};

const createNotFoundError = () => {
  const error = new Error("Object not found") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
};

export const isBucketStorage = () => driver === "bucket";

export const ensureStorageDir = async (relativeDir: string) => {
  if (!relativeDir || driver !== "local") {
    return;
  }

  await mkdir(toLocalPath(relativeDir), { recursive: true });
};

export async function readStorageFile(relativePath: string, encoding: BufferEncoding): Promise<string>;
export async function readStorageFile(relativePath: string): Promise<Buffer>;
export async function readStorageFile(relativePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
  if (driver === "local") {
    const pathOrFile = toLocalPath(relativePath);
    return readFile(pathOrFile, encoding);
  }

  try {
    const buffer = await bucketRead(relativePath);
    return encoding ? buffer.toString(encoding) : buffer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw createNotFoundError();
    }
    throw error;
  }
}

interface WriteOptions {
  contentType?: string;
}

export const writeStorageFile = async (
  relativePath: string,
  content: string | Buffer,
  options?: WriteOptions,
) => {
  if (driver === "local") {
    const dir = getParentKey(relativePath);
    if (dir) {
      await ensureStorageDir(dir);
    }

    await writeFile(toLocalPath(relativePath), content);
    return;
  }

  await bucketWrite(relativePath, content, options?.contentType);
};

export const deleteStorageFile = async (relativePath: string) => {
  if (driver === "local") {
    const normalized = normalizeKey(relativePath);
    if (path.isAbsolute(relativePath)) {
      try {
        await unlink(relativePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      return;
    }

    try {
      await unlink(toLocalPath(normalized));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }

  await bucketDelete(relativePath);
};
