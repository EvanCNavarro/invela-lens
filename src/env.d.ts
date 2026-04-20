interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  BUILD_VERSION?: string;
  ANTHROPIC_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
}
