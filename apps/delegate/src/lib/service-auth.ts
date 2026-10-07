import { prisma } from "./db";
import { verifySecretCached } from "./secrets";

/** A registered service, authenticated by its own key (x-service-key). */
export async function serviceFromRequest(req: Request, slug: string) {
  const key = req.headers.get("x-service-key") ?? "";
  const service = slug ? await prisma.service.findUnique({ where: { slug } }) : null;
  return service && key && verifySecretCached(key, service.apiKeyHash) ? service : null;
}
