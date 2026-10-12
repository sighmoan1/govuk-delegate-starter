# Connected navigation

The connected services menu is owned by Delegate in this repository. It is implemented as the workspace package `@prototype/connected-navigation`.

## Source of truth

- Destination configuration: `packages/connected-navigation/src/config.ts`
- React adapter for Next.js apps: `packages/connected-navigation/src/react.tsx`
- Server-rendered HTML adapter for plain Node services: `packages/connected-navigation/src/html.ts`
- Drawer assets: `packages/connected-navigation/assets/connected-navigation.css` and `.js`

The Bathos design-system repository remains the shared source for tokens and reusable controls. Its adoption contract leaves framework-specific navigation adapters in each consumer, so this repository keeps Delegate destinations here rather than exporting them to other Bathos projects.

## Public and private menus

Public mode includes only:

- About Delegate briefing;
- Demonstration guide;
- Delegate account permission management;
- HMRC demonstration;
- WhenIsBins demonstration.

It must not include presenter controls, reset routes, Sam's phone, synthetic sign-in codes, protected Observatory routes or internal research tooling. One Login remains an authentication destination reached from service journeys, not a normal menu item.

Private/local mode may include local service URLs, and can include Council or Observatory only when their URLs are explicitly configured.

## Updating links

Use documented public endpoints from `docs/DEMO_GUIDE.md` and `docs/LOCAL_RUNTIME.md`, then verify availability before changing public defaults. For named public deployments, `ABOUT_PUBLIC_URL`, `DELEGATE_PUBLIC_URL`, `HMRC_PUBLIC_URL` and `WHENISBINS_PUBLIC_URL` override the defaults when they are HTTPS URLs.

Run at least:

```sh
npx vitest run tests/connected-navigation.test.ts tests/public-briefing.test.ts
npm test -w apps/whenisbins -- assets
```

For release readiness, also run the normal authority and browser-agent checks described in `AGENTS.md` and `docs/VALIDATION.md`.
