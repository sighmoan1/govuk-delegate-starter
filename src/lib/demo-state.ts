// The demo narrator. Not part of Delegate or the agent: it reads both, so the
// guide strip can say what to do next without the visitor knowing the order.
import { prisma } from "./db";
import { CONV_COOKIE, loadConversation } from "./agent/conversation";
import { config } from "./config";

export const DEMO_COOKIE = "demo_started";

export type DemoStep = { n: number; of: number; text: string; href?: string; linkText?: string };

export async function demoStep(cookie: (name: string) => string | undefined): Promise<DemoStep> {
  const of = 6;
  const conv = await loadConversation(cookie(CONV_COOKIE));
  const items = conv?.state.display ?? [];
  const steps = items.filter((i) => i.kind === "step");

  if (!conv || items.length === 0) {
    return { n: 1, of, text: "You are Sam. Ask your AI assistant to claim your working-from-home tax relief.", href: "/example-ai", linkText: "Open the assistant" };
  }
  if (conv.pendingRequestId) {
    const req = await prisma.authorisationRequest.findUnique({ where: { id: conv.pendingRequestId } });
    if (req?.status === "PENDING") {
      return { n: 2, of, text: "The assistant has asked for permission. Decide on GOV.UK: sign in, choose what to allow.", href: `/consent/${req.id}`, linkText: "Go to GOV.UK" };
    }
  }
  if (!conv.principalId) {
    return { n: 1, of, text: "Ask the assistant to claim your working-from-home tax relief.", href: "/example-ai", linkText: "Back to the assistant" };
  }

  const delegate = await prisma.delegate.findUnique({ where: { clientId: config.demoAgentClientId } });
  const active = delegate
    ? await prisma.authorisation.findFirst({ where: { principalId: conv.principalId, delegateId: delegate.id, status: "ACTIVE" } })
    : null;
  const refusedMissing = steps.some((s) => s.kind === "step" && s.reason === "PERMISSION_MISSING");
  const refusedRevoked = steps.some((s) => s.kind === "step" && s.reason === "AUTHORISATION_REVOKED");

  if (active && !refusedMissing) {
    return { n: 3, of, text: "It worked. Now ask it to change your refund bank account. You didn’t allow that, so HMRC should refuse.", href: "/example-ai#latest", linkText: "Back to the assistant" };
  }
  if (active) {
    return { n: 4, of, text: "Change your mind: remove the assistant’s access in your GOV.UK account.", href: "/account/delegates", linkText: "Who can act for you" };
  }
  if (!refusedRevoked) {
    return { n: 5, of, text: "Access removed. Ask the assistant for your tax code again: HMRC should now refuse.", href: "/example-ai#latest", linkText: "Back to the assistant" };
  }
  return { n: 6, of, text: "See what HMRC’s service team sees: every attempt, allowed or refused.", href: "/operator/activity", linkText: "HMRC team view" };
}
