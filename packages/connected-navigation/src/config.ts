export type NavigationMode = "private" | "public";

export type NavigationItem = {
  id: "about" | "demo" | "delegate" | "hmrc" | "whenisbins" | "council" | "observatory";
  label: string;
  href: string;
  description: string;
  external?: boolean;
};

export type NavigationEnvironment = {
  [key: string]: string | undefined;
  ABOUT_PUBLIC_URL?: string;
  ABOUT_URL?: string;
  DELEGATE_PUBLIC_URL?: string;
  DELEGATE_URL?: string;
  HMRC_PUBLIC_URL?: string;
  HMRC_URL?: string;
  WHENISBINS_PUBLIC_URL?: string;
  WHENISBINS_URL?: string;
  COUNCIL_URL?: string;
  OBSERVATORY_URL?: string;
};

export type NavigationOptions = {
  mode?: NavigationMode;
  includeCouncil?: boolean;
  includeObservatory?: boolean;
};

const VERIFIED_PUBLIC = {
  about: "https://about-demo.bathos.org",
  delegate: "https://delegate-demo.bathos.org",
  hmrc: "https://hmrc-demo.bathos.org",
  whenisbins: "https://whenisbins-demo.bathos.org",
};

function base(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function publicBase(value: string | undefined, fallback: string) {
  const parsed = base(value);
  if (!parsed) return fallback;
  const url = new URL(parsed);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) return fallback;
  return parsed;
}

function join(origin: string, path = "/") {
  const url = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
  return url.toString();
}

export function delegateNavigationFromEnv(env: NavigationEnvironment = {}, options: NavigationOptions = {}): NavigationItem[] {
  const mode = options.mode ?? "private";
  const about = mode === "public"
    ? publicBase(env.ABOUT_PUBLIC_URL ?? env.ABOUT_URL, VERIFIED_PUBLIC.about)
    : base(env.ABOUT_URL ?? env.ABOUT_PUBLIC_URL) ?? "http://localhost:3304";
  const delegate = mode === "public"
    ? publicBase(env.DELEGATE_PUBLIC_URL ?? env.DELEGATE_URL, VERIFIED_PUBLIC.delegate)
    : base(env.DELEGATE_URL ?? env.DELEGATE_PUBLIC_URL) ?? "http://localhost:3300";
  const hmrc = mode === "public"
    ? publicBase(env.HMRC_PUBLIC_URL ?? env.HMRC_URL, VERIFIED_PUBLIC.hmrc)
    : base(env.HMRC_URL ?? env.HMRC_PUBLIC_URL) ?? "http://localhost:3302";
  const whenisbins = mode === "public"
    ? publicBase(env.WHENISBINS_PUBLIC_URL ?? env.WHENISBINS_URL, VERIFIED_PUBLIC.whenisbins)
    : base(env.WHENISBINS_URL ?? env.WHENISBINS_PUBLIC_URL) ?? VERIFIED_PUBLIC.whenisbins;

  const links: NavigationItem[] = [
    { id: "about", label: "About Delegate", href: join(about, mode === "public" ? "/briefing" : "/"), description: "Proposition, briefings and current project status" },
    { id: "demo", label: "Demonstration guide", href: join(about, "/briefing/demo"), description: "How to follow the consent, action and revocation journey" },
    { id: "delegate", label: "Manage permissions", href: join(delegate, "/account/delegates"), description: "Review, narrow and remove delegated authority" },
    { id: "hmrc", label: "HMRC demonstration", href: join(hmrc, "/"), description: "Synthetic tax service and browser-agent entry point" },
    { id: "whenisbins", label: "WhenIsBins", href: join(whenisbins, "/"), description: "Separate service integration with qualified evidence" },
  ];

  const council = base(env.COUNCIL_URL);
  if (options.includeCouncil && council) {
    links.push({ id: "council", label: "Council proof", href: join(council, "/"), description: "Synthetic council casework integration" });
  }

  const observatory = base(env.OBSERVATORY_URL);
  if (mode === "private" && options.includeObservatory && observatory) {
    links.push({ id: "observatory", label: "Observatory", href: join(observatory, "/"), description: "Protected research workbench" });
  }

  return links.map((item) => ({ ...item, external: /^https?:\/\//.test(item.href) }));
}
