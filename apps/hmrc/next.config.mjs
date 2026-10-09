/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  transpilePackages: ["@prototype/web-bot-auth", "@prototype/research-feed"],
  serverExternalPackages: ["@prisma/client"],
};
