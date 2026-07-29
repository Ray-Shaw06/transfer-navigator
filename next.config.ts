import type { NextConfig } from 'next';

// TypeScript 7 (this project's pinned compiler) does not expose the
// language-service API Next.js's dev server normally uses for on-the-fly
// diagnostics. Without this flag `next dev` hangs on the first request
// instead of serving it. This does not change what tsc itself checks;
// `npx tsc --noEmit` is still the source of truth for type errors.
const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
