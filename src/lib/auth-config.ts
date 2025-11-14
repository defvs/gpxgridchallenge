const normalize = (value?: string) => value?.trim() ?? "";

const publishableKey = normalize(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const secretKey = normalize(process.env.CLERK_SECRET_KEY);

export const isClerkConfigured = Boolean(publishableKey && secretKey);

export const singleUserId = normalize(process.env.DEV_STORAGE_USER_ID) || "dev-user";
