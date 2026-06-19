const DEFAULT_SITE_URL = "http://localhost:4000";

function normalizeSiteUrl(siteUrl: string) {
  return siteUrl.startsWith("http://") || siteUrl.startsWith("https://")
    ? siteUrl
    : `https://${siteUrl}`;
}

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    DEFAULT_SITE_URL
  );
}

export function getMetadataBase() {
  return new URL(normalizeSiteUrl(getSiteUrl()));
}
