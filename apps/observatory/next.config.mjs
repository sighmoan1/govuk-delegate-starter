/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  transpilePackages: ["@prototype/research-feed"],
  serverExternalPackages: ["@prisma/client"],
};
