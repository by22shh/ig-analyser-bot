import { mkdir, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

type Scenario = "empty" | "long-report" | "payment-error";

const publicRoot = resolve("public", "mini-app");
const screenshotDir = resolve(
  "docs",
  "audit",
  "2026-06-12-fix-all-problems",
  "screenshots",
  "phase-11"
);

let currentScenario: Scenario = "empty";

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  });
});

await mkdir(screenshotDir, { recursive: true });
await listen();

let browser: Browser | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SMOKE_SERVER_ADDRESS_INVALID");
  const baseUrl = `http://127.0.0.1:${address.port}/mini-app`;

  const screenshots = [
    await capture(browser, baseUrl, "empty", "mini-app-mobile-empty-reports.png", {
      width: 390,
      height: 844,
      action: async (page) => {
        await page.getByRole("button", { name: /Отчеты/ }).click();
        await page.getByText("История пока пустая").waitFor();
      }
    }),
    await capture(browser, baseUrl, "long-report", "mini-app-desktop-long-report.png", {
      width: 1280,
      height: 900,
      action: async (page) => {
        await page.getByRole("button", { name: /Отчеты/ }).click();
        await page.getByRole("button", { name: /complex_profile/ }).click();
        await page.locator(".section-body").getByText("Это намеренно длинный блок").waitFor();
      }
    }),
    await capture(browser, baseUrl, "payment-error", "mini-app-mobile-payment-error.png", {
      width: 390,
      height: 844,
      action: async (page) => {
        await page.locator(".tab[data-tab='credits']").click();
        await page.getByRole("button", { name: /Команда/ }).click();
        await page.locator(".notice").getByText("Укажите email").waitFor();
        await page.locator("#toast").waitFor({ state: "hidden" });
      }
    })
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        screenshots,
        checked: ["mobile empty reports", "desktop long report", "mobile payment error"]
      },
      null,
      2
    )}\n`
  );
} finally {
  await browser?.close();
  await closeServer();
}

async function capture(
  browserInstance: Browser,
  baseUrl: string,
  scenario: Scenario,
  fileName: string,
  options: { width: number; height: number; action: (page: Page) => Promise<void> }
) {
  currentScenario = scenario;
  const context = await browserInstance.newContext({
    locale: "ru-RU",
    viewport: { width: options.width, height: options.height }
  });
  await context.addInitScript(() => {
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: {
        version: "6.0",
        initData: "",
        initDataUnsafe: { user: { language_code: "ru" } },
        ready() {},
        expand() {},
        HapticFeedback: { notificationOccurred() {} }
      }
    };
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await options.action(page);
    await assertNoHorizontalOverflow(page, fileName);
    const screenshotPath = resolve(screenshotDir, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } finally {
    await context.close();
  }
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflow = root.scrollWidth - root.clientWidth;
    const offenders = Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .slice(0, 8)
      .map((element) => {
        const selector = element.id
          ? `#${element.id}`
          : `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).replace(/\s+/g, ".")}` : ""}`;
        return {
          selector,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        };
      });
    return { overflow, offenders };
  });
  if (result.overflow > 1) {
    throw new Error(
      `${label}: horizontal overflow ${result.overflow}px ${JSON.stringify(result.offenders)}`
    );
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/mini-app/")) {
    return handleApi(url, response);
  }
  const fileName =
    url.pathname === "/mini-app" || url.pathname === "/mini-app/" || url.pathname === "/"
      ? "index.html"
      : url.pathname.replace(/^\/mini-app\//, "");
  const filePath = resolve(publicRoot, fileName);
  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  try {
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
}

function handleApi(url: URL, response: ServerResponse) {
  if (url.pathname === "/api/mini-app/bootstrap") {
    sendJson(response, 200, bootstrapFixture(currentScenario));
    return;
  }
  if (url.pathname === "/api/mini-app/jobs") {
    sendJson(response, 200, { jobs: [], credits: creditsFixture() });
    return;
  }
  if (url.pathname === "/api/mini-app/reports") {
    sendJson(response, 200, { reports: reportsFixture(currentScenario) });
    return;
  }
  if (url.pathname === "/api/mini-app/reports/long-report") {
    sendJson(response, 200, { report: longReportFixture() });
    return;
  }
  if (url.pathname === "/api/mini-app/payments/yookassa") {
    sendJson(response, 400, { ok: false, error: { code: "EMAIL_REQUIRED" } });
    return;
  }
  sendJson(response, 404, { ok: false, error: { code: "NOT_FOUND" } });
}

function bootstrapFixture(scenario: Scenario) {
  return {
    brandName: "SocialAnalyserBot",
    user: {
      id: "visual-user",
      telegramId: "900000001",
      username: "local_mini_app",
      firstName: "Local",
      lastName: "Tester",
      name: "Local Tester",
      language: "ru",
      role: "user",
      status: "active",
      email: "",
      consentAccepted: true,
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    features: {
      hrMode: true,
      influencerMode: true,
      osintMode: false,
      photoSearch: false,
      telegramStars: true,
      yookassa: true,
      yookassaReceipts: true,
      requireChannelSubscription: false
    },
    subscription: { required: false, ok: true, channelUrl: "https://t.me/example" },
    costs: { standard: 100, influencer: 200, hr: 200, osint_compliance: 300, chat_message: 20 },
    credits: creditsFixture(),
    stats: {
      completedReports: scenario === "long-report" ? 7 : 0,
      activeJobs: 0,
      retentionDays: 30,
      exportFormat: "pdf"
    },
    packages: {
      stars: [{ code: "starter", title: "Старт", creditsUnits: 300, credits: 3, starsAmount: 690 }],
      yookassa: [
        {
          code: "team",
          title: "Команда: 10 отчетов",
          creditsUnits: 1000,
          credits: 10,
          rubAmount: 990
        }
      ]
    },
    reports: reportsFixture(scenario),
    jobs: []
  };
}

function creditsFixture() {
  return {
    balanceUnits: 300,
    reservedUnits: 0,
    availableUnits: 300,
    purchasedUnits: 300,
    grantedUnits: 0,
    balance: 3,
    available: 3,
    reserved: 0,
    purchased: 3,
    granted: 0
  };
}

function reportsFixture(scenario: Scenario) {
  if (scenario !== "long-report") return [];
  return [
    {
      id: "long-report",
      username: "complex_profile",
      mode: "hr",
      language: "ru",
      summary: {
        bullets: [
          "Длинное резюме без переполнения в карточке отчета",
          "Проверка переносов, метрик и секций"
        ]
      },
      metrics: { followersCount: 128734, engagementRate: 4.82, analyzedPosts: 42 },
      artifactTypes: ["pdf", "markdown", "html"],
      createdAt: "2026-06-12T10:00:00.000Z",
      expiresAt: "2026-07-12T10:00:00.000Z"
    }
  ];
}

function longReportFixture() {
  const report = reportsFixture("long-report")[0];
  if (!report) throw new Error("LONG_REPORT_FIXTURE_MISSING");
  return {
    ...report,
    model: "visual-smoke",
    promptVersion: "phase-11",
    rawText: "Проверка длинного отчета",
    sections: [
      {
        id: "section-1",
        position: 1,
        title: "Проверка длинного отчета",
        content:
          "Это намеренно длинный блок отчета для проверки мобильных и desktop-переносов. В тексте есть метрики, осторожные формулировки и несколько предложений подряд, чтобы секция оставалась читаемой без горизонтального скролла.\n\nРекомендация: использовать мягкий тон, не делать категоричных выводов и опираться только на публичные источники.",
        kind: "summary",
        sources: [
          {
            label: "Публичный пост с длинным описанием источника",
            url: "https://example.com/reports/source/one"
          },
          { label: "Профиль Instagram", url: "https://instagram.com/complex_profile" }
        ]
      },
      {
        id: "section-2",
        position: 2,
        title: "Коммуникационные сигналы и риски",
        content:
          "Секция проверяет навигацию между разделами. Заголовки не должны вытеснять стрелки, а кнопки секций должны переносить длинные названия без скачков layout.",
        kind: "risks",
        sources: []
      }
    ],
    artifacts: [
      {
        id: "artifact-1",
        type: "pdf",
        sizeBytes: 12000,
        available: true,
        downloadPath: "/api/mini-app/reports/long-report/artifacts/pdf"
      },
      {
        id: "artifact-2",
        type: "markdown",
        sizeBytes: 8000,
        available: true,
        downloadPath: "/api/mini-app/reports/long-report/artifacts/markdown"
      },
      {
        id: "artifact-3",
        type: "html",
        sizeBytes: 10000,
        available: true,
        downloadPath: "/api/mini-app/reports/long-report/artifacts/html"
      }
    ]
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function contentType(filePath: string) {
  const extension = extname(filePath);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "application/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function listen() {
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

async function closeServer() {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}
