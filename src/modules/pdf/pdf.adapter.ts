import { chromium } from "playwright";
import { env } from "../../config/env.js";

export interface PdfAdapter {
  renderPdf(html: string): Promise<Buffer>;
}

export class PlaywrightPdfAdapter implements PdfAdapter {
  async renderPdf(html: string): Promise<Buffer> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle", timeout: (env.PDF_RENDER_TIMEOUT_SECONDS ?? 60) * 1000 });
      const bytes = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" }
      });
      return Buffer.from(bytes);
    } finally {
      await browser.close();
    }
  }
}

export class MockPdfAdapter implements PdfAdapter {
  async renderPdf(html: string): Promise<Buffer> {
    return Buffer.from(html, "utf8");
  }
}
