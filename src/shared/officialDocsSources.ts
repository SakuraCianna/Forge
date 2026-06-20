// 本文件说明: 维护内置 Web/Docs 工具共享的官方文档来源与可信来源识别规则
export type DocumentationSourceType = "official-docs" | "trusted-docs" | "web";

export type OfficialDocsSource = {
  id: string;
  label: string;
  url: string;
  host: string;
  topics: readonly string[];
};

export type DocumentationSourceClassification = {
  type: DocumentationSourceType;
  trusted: boolean;
  label: string;
  host: string;
  officialDocs?: OfficialDocsSource;
};

type OfficialDocsSourceDefinition = OfficialDocsSource & {
  pattern: RegExp;
};

type TrustedDocumentationHost = {
  host: string;
  label: string;
};

const officialDocsSourceDefinitions: readonly OfficialDocsSourceDefinition[] = [
  docsSource("react-router", "React Router", "https://reactrouter.com/", ["react router"], /\breact\s*router\b/u),
  docsSource("react", "React", "https://react.dev/reference/react", ["react", "reactjs"], /\breact(?:\.js|js)?\b/u),
  docsSource("nextjs", "Next.js", "https://nextjs.org/docs", ["next.js", "nextjs"], /\bnext(?:\.js|js)?\b/u),
  docsSource("nuxt", "Nuxt", "https://nuxt.com/docs/getting-started/introduction", ["nuxt"], /\bnuxt(?:\.js|js)?\b/u),
  docsSource("vue", "Vue", "https://vuejs.org/guide/introduction.html", ["vue", "vuejs"], /\bvue(?:\.js|js)?\b/u),
  docsSource("vite", "Vite", "https://vite.dev/guide/", ["vite"], /\bvite\b/u),
  docsSource("typescript", "TypeScript", "https://www.typescriptlang.org/docs/", ["typescript", "ts"], /\btypescript\b|\bts\b/u),
  docsSource("javascript", "JavaScript", "https://developer.mozilla.org/en-US/docs/Web/JavaScript", ["javascript", "js", "ecmascript"], /\bjavascript\b|\bjs\b|\becmascript\b/u),
  docsSource("nodejs", "Node.js", "https://nodejs.org/api/", ["node.js", "nodejs"], /\bnode(?:\.js|js)?\b/u),
  docsSource("electron", "Electron", "https://www.electronjs.org/docs/latest/", ["electron"], /\belectron\b/u),
  docsSource("tauri", "Tauri", "https://v2.tauri.app/start/", ["tauri"], /\btauri\b/u),
  docsSource("tailwind", "Tailwind CSS", "https://tailwindcss.com/docs/installation/using-vite", ["tailwind", "tailwind css"], /\btailwind(?:\s*css)?\b/u),
  docsSource("playwright", "Playwright", "https://playwright.dev/docs/intro", ["playwright"], /\bplaywright\b/u),
  docsSource("vitest", "Vitest", "https://vitest.dev/guide/", ["vitest"], /\bvitest\b/u),
  docsSource("jest", "Jest", "https://jestjs.io/docs/getting-started", ["jest"], /\bjest\b/u),
  docsSource("eslint", "ESLint", "https://eslint.org/docs/latest/", ["eslint"], /\beslint\b/u),
  docsSource("prettier", "Prettier", "https://prettier.io/docs/", ["prettier"], /\bprettier\b/u),
  docsSource("prisma", "Prisma", "https://www.prisma.io/docs", ["prisma"], /\bprisma\b/u),
  docsSource("supabase", "Supabase", "https://supabase.com/docs", ["supabase"], /\bsupabase\b/u),
  docsSource("vercel", "Vercel", "https://vercel.com/docs", ["vercel"], /\bvercel\b/u),
  docsSource("openai", "OpenAI", "https://developers.openai.com/api/docs", ["openai", "responses api"], /\bopenai\b|\bresponses api\b/u),
  docsSource("stripe", "Stripe", "https://docs.stripe.com/", ["stripe"], /\bstripe\b/u),
  docsSource("github-actions", "GitHub Actions", "https://docs.github.com/en/actions", ["github actions", "actions workflow"], /\bgithub actions\b|\bactions workflow\b/u),
  docsSource("cloudflare-workers", "Cloudflare Workers", "https://developers.cloudflare.com/workers/", ["cloudflare workers", "workers"], /\bcloudflare\s*workers\b/u),
  docsSource("spring-boot", "Spring Boot", "https://docs.spring.io/spring-boot/index.html", ["spring boot", "springboot"], /\bspring\s*boot\b|\bspringboot\b/u),
  docsSource("maven", "Maven", "https://maven.apache.org/guides/", ["maven"], /\bmaven\b/u),
  docsSource("gradle", "Gradle", "https://docs.gradle.org/current/userguide/userguide.html", ["gradle"], /\bgradle\b/u),
  docsSource("java", "Java", "https://docs.oracle.com/en/java/", ["java"], /\bjava\b/u),
  docsSource("python", "Python", "https://docs.python.org/3/", ["python", "py"], /\bpython\b|\bpy\b/u),
  docsSource("django", "Django", "https://docs.djangoproject.com/en/stable/", ["django"], /\bdjango\b/u),
  docsSource("fastapi", "FastAPI", "https://fastapi.tiangolo.com/", ["fastapi"], /\bfastapi\b/u),
  docsSource("go", "Go", "https://go.dev/doc/", ["go", "golang"], /\bgo\b|\bgolang\b/u),
  docsSource("rust", "Rust", "https://doc.rust-lang.org/book/", ["rust"], /\brust\b/u),
  docsSource("aspnet-core", "ASP.NET Core", "https://learn.microsoft.com/aspnet/core/", ["asp.net core", "aspnet core"], /\basp\.net\s*core\b|\baspnet\s*core\b/u),
  docsSource("csharp", "C#", "https://learn.microsoft.com/dotnet/csharp/", ["c#", "csharp"], /c#|\bcsharp\b|\bc sharp\b/u),
  docsSource("dotnet", ".NET", "https://learn.microsoft.com/dotnet/", [".net", "dotnet"], /\b\.net\b|\bdotnet\b/u),
  docsSource("php", "PHP", "https://www.php.net/docs.php", ["php"], /\bphp\b/u),
  docsSource("laravel", "Laravel", "https://laravel.com/docs", ["laravel"], /\blaravel\b/u),
  docsSource("rails", "Ruby on Rails", "https://guides.rubyonrails.org/", ["rails", "ruby on rails"], /\bruby\s*on\s*rails\b|\brails\b/u),
  docsSource("ruby", "Ruby", "https://www.ruby-lang.org/en/documentation/", ["ruby"], /\bruby\b/u),
  docsSource("swift", "Swift", "https://www.swift.org/documentation/", ["swift"], /\bswift\b/u),
  docsSource("kotlin", "Kotlin", "https://kotlinlang.org/docs/home.html", ["kotlin"], /\bkotlin\b/u),
  docsSource("flutter", "Flutter", "https://docs.flutter.dev/", ["flutter"], /\bflutter\b/u),
  docsSource("android", "Android Developers", "https://developer.android.com/develop", ["android"], /\bandroid\b/u),
  docsSource("apple", "Apple Developer", "https://developer.apple.com/documentation/", ["apple developer", "ios", "macos", "swiftui"], /\bapple developer\b|\bios\b|\bmacos\b|\bswiftui\b/u),
  docsSource("docker", "Docker", "https://docs.docker.com/", ["docker"], /\bdocker\b/u),
  docsSource("kubernetes", "Kubernetes", "https://kubernetes.io/docs/home/", ["kubernetes", "k8s"], /\bkubernetes\b|\bk8s\b/u),
  docsSource("postgresql", "PostgreSQL", "https://www.postgresql.org/docs/", ["postgresql", "postgres"], /\bpostgresql\b|\bpostgres\b/u),
  docsSource("mysql", "MySQL", "https://dev.mysql.com/doc/", ["mysql"], /\bmysql\b/u),
  docsSource("redis", "Redis", "https://redis.io/docs/latest/", ["redis"], /\bredis\b/u),
  docsSource("mongodb", "MongoDB", "https://www.mongodb.com/docs/", ["mongodb", "mongo"], /\bmongodb\b|\bmongo\b/u),
  docsSource("npm", "npm", "https://docs.npmjs.com/", ["npm"], /\bnpm\b/u),
  docsSource("pnpm", "pnpm", "https://pnpm.io/motivation", ["pnpm"], /\bpnpm\b/u),
  docsSource("yarn", "Yarn", "https://yarnpkg.com/getting-started", ["yarn"], /\byarn\b/u),
  docsSource("angular", "Angular", "https://angular.dev/overview", ["angular"], /\bangular\b/u),
  docsSource("svelte", "Svelte", "https://svelte.dev/docs", ["svelte"], /\bsvelte\b/u),
  docsSource("astro", "Astro", "https://docs.astro.build/en/getting-started/", ["astro"], /\bastro\b/u)
];

const trustedDocumentationHosts: readonly TrustedDocumentationHost[] = [
  { host: "developer.mozilla.org", label: "MDN Web Docs" },
  { host: "learn.microsoft.com", label: "Microsoft Learn" },
  { host: "docs.github.com", label: "GitHub Docs" },
  { host: "developer.chrome.com", label: "Chrome for Developers" },
  { host: "developers.google.com", label: "Google Developers" },
  { host: "cloud.google.com", label: "Google Cloud Docs" },
  { host: "docs.aws.amazon.com", label: "AWS Docs" },
  { host: "docs.rs", label: "docs.rs" },
  { host: "pkg.go.dev", label: "Go Packages" }
];

export const officialDocsSources: readonly OfficialDocsSource[] = officialDocsSourceDefinitions.map(
  toOfficialDocsSource
);

export function resolveOfficialDocsSource(topic: string): OfficialDocsSource | null {
  const normalizedTopic = topic.toLocaleLowerCase();
  const match = officialDocsSourceDefinitions.find((source) => source.pattern.test(normalizedTopic));

  return match ? toOfficialDocsSource(match) : null;
}

export function classifyDocumentationUrl(url: string): DocumentationSourceClassification {
  const host = extractNormalizedHost(url);

  if (!host) {
    return {
      type: "web",
      trusted: false,
      label: "web",
      host: "web"
    };
  }

  const officialDocs = findBestOfficialDocsSourceForUrl(url);

  if (officialDocs) {
    const officialSource = toOfficialDocsSource(officialDocs);

    return {
      type: "official-docs",
      trusted: true,
      label: officialSource.label,
      host,
      officialDocs: officialSource
    };
  }

  const trustedDocs = trustedDocumentationHosts.find((source) => hostMatches(host, source.host));

  if (trustedDocs) {
    return {
      type: "trusted-docs",
      trusted: true,
      label: trustedDocs.label,
      host
    };
  }

  const officialHostSource = officialDocsSourceDefinitions.find((source) => hostMatches(host, source.host));

  if (officialHostSource) {
    return {
      type: "trusted-docs",
      trusted: true,
      label: officialHostSource.label,
      host
    };
  }

  return {
    type: "web",
    trusted: false,
    label: host,
    host
  };
}

function findBestOfficialDocsSourceForUrl(url: string): OfficialDocsSourceDefinition | null {
  const matches = officialDocsSourceDefinitions.filter((source) => officialDocsUrlMatches(url, source));

  return matches
    .sort((left, right) => normalizedUrlPath(right.url).length - normalizedUrlPath(left.url).length)
    .at(0) ?? null;
}

function officialDocsUrlMatches(url: string, source: OfficialDocsSourceDefinition): boolean {
  try {
    const candidateUrl = new URL(url);
    const sourceUrl = new URL(source.url);
    const candidateHost = normalizeHost(candidateUrl.hostname);
    const sourceHost = normalizeHost(sourceUrl.hostname);
    const sourcePath = normalizedUrlPath(source.url);

    return hostMatches(candidateHost, sourceHost) && normalizedUrlPath(url).startsWith(sourcePath);
  } catch {
    return false;
  }
}

function docsSource(
  id: string,
  label: string,
  url: string,
  topics: readonly string[],
  pattern: RegExp
): OfficialDocsSourceDefinition {
  return {
    id,
    label,
    url,
    host: extractNormalizedHost(url) || "web",
    topics,
    pattern
  };
}

function toOfficialDocsSource(source: OfficialDocsSourceDefinition): OfficialDocsSource {
  return {
    id: source.id,
    label: source.label,
    url: source.url,
    host: source.host,
    topics: [...source.topics]
  };
}

function extractNormalizedHost(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function hostMatches(host: string, expectedHost: string): boolean {
  const normalizedHost = normalizeHost(host);
  const normalizedExpectedHost = normalizeHost(expectedHost);

  return normalizedHost === normalizedExpectedHost || normalizedHost.endsWith(`.${normalizedExpectedHost}`);
}

function normalizedUrlPath(url: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/u, "");

    return pathname || "/";
  } catch {
    return "/";
  }
}

function normalizeHost(host: string): string {
  return host.toLocaleLowerCase().replace(/^www\./u, "");
}
