/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  transpilePackages: ["@prototype/web-bot-auth"],
  serverExternalPackages: ["@prisma/client"],
};
