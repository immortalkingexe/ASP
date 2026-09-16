import "server-only";

export interface UnstructuredElementMetadata {
  page_number?: number;
  filename?: string;
  [key: string]: any;
}

export interface UnstructuredElement {
  type: string;
  text: string;
  metadata: UnstructuredElementMetadata;
}

export interface UnstructuredExtractionResult {
  success: boolean;
  filename: string;
  element_count: number;
  text: string;
  elements: UnstructuredElement[];
}

export interface ExtractionClientOptions {
  timeoutMs?: number;
}

export class UnstructuredExtractionService {
  private static hasLoggedConfig = false;

  private static get ServiceUrl(): string {
    const envVar =
      process.env.EXTRACTION_SERVICE_URL ||
      process.env.DOCUMENT_EXTRACTION_SERVICE_URL ||
      process.env.FASTAPI_URL ||
      process.env.DOCUMENT_PROCESSOR_URL;

    if (!this.hasLoggedConfig) {
      this.hasLoggedConfig = true;
      console.log(
        `[CONFIG] EXTRACTION_SERVICE_URL resolved to: ${envVar || "(NOT SET)"} (env: ${process.env.NODE_ENV || "development"})`
      );
    }

    if (envVar && envVar.trim().length > 0) {
      return envVar.trim().replace(/\/+$/, "");
    }

    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    if (isProduction) {
      console.error(
        "[ExtractionService Config Error] Neither EXTRACTION_SERVICE_URL nor DOCUMENT_EXTRACTION_SERVICE_URL environment variable is defined in Vercel settings."
      );
      throw new Error(
        "Document extraction service configuration error: EXTRACTION_SERVICE_URL is missing in Vercel environment variables. Please add EXTRACTION_SERVICE_URL=https://asp-extraction-service.onrender.com in Vercel settings."
      );
    }

    // Local development fallback
    return "http://localhost:8000";
  }

  /**
   * Health check endpoint to verify extraction service connectivity
   */
  public static async checkHealth(timeoutMs = 30000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${this.ServiceUrl}/health`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        console.warn(`[ExtractionService Health] Returned HTTP ${res.status}`);
        return false;
      }

      const data = await res.json();
      return data?.status === "ok";
    } catch (err: any) {
      console.error(`[ExtractionService Health Failed] ${err?.message || err}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Extract content from document buffer using Python Unstructured Service.
   * Includes automatic retry for Render free-tier cold starts.
   */
  public static async extractDocument(
    fileBuffer: ArrayBuffer | Buffer,
    fileName: string,
    options: ExtractionClientOptions = {}
  ): Promise<UnstructuredExtractionResult> {
    const timeoutMs = options.timeoutMs ?? 90000; // 90s default for Render cold starts
    const serviceBaseUrl = this.ServiceUrl;
    const extractEndpoint = `${serviceBaseUrl}/extract`;
    const bufferObj = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

    console.log(`[ExtractionClient] Submitting "${fileName}" (${bufferObj.byteLength} bytes) to ${extractEndpoint}`);

    const executeRequest = async (isRetry = false): Promise<UnstructuredExtractionResult> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const blob = new Blob([bufferObj as any]);
        const formData = new FormData();
        formData.append("file", blob, fileName);

        const response = await fetch(extractEndpoint, {
          method: "POST",
          body: formData,
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          let errDetail = "";
          try {
            const errJson = await response.json();
            errDetail = errJson.detail || errJson.error || JSON.stringify(errJson);
          } catch {
            errDetail = await response.text();
          }

          console.error(`[ExtractionClient HTTP ${response.status}] ${extractEndpoint}: ${errDetail}`);

          if (response.status === 400) {
            throw new Error(`Document extraction rejected by service (HTTP 400): ${errDetail || "Invalid file payload"}`);
          } else if (response.status === 415) {
            throw new Error(`Unsupported document format (HTTP 415): ${errDetail}`);
          } else if (response.status === 502 || response.status === 503) {
            throw new Error(`Document extraction service unavailable (HTTP ${response.status}): ${errDetail || "Service starting up or temporarily unavailable"}`);
          } else if (response.status === 500) {
            throw new Error(`Document extraction failed on service (HTTP 500): ${errDetail || "Internal extraction error"}`);
          } else {
            throw new Error(`Document extraction service error (HTTP ${response.status}): ${errDetail || "Request failed"}`);
          }
        }

        const data = await response.json();

        if (!data || typeof data !== "object") {
          throw new Error("Document extraction service returned a malformed response object.");
        }

        let fullText = typeof data.text === "string" ? data.text.trim() : "";
        const rawElements = Array.isArray(data.elements) ? data.elements : [];

        if (!fullText && rawElements.length > 0) {
          fullText = rawElements
            .map((el: any) => String(el.text || "").trim())
            .filter((t: string) => t.length > 0)
            .join("\n\n");
        }

        const parsedElements: UnstructuredElement[] = rawElements.map((el: any) => ({
          type: String(el.type || "UncategorizedText"),
          text: String(el.text || "").trim(),
          metadata: {
            page_number: el.metadata?.page_number ?? undefined,
            filename: el.metadata?.filename || fileName,
            ...el.metadata,
          },
        }));

        const normalized: UnstructuredExtractionResult = {
          success: Boolean(data.success) || fullText.length > 0 || parsedElements.length > 0,
          filename: data.filename || fileName,
          element_count: typeof data.element_count === "number" ? data.element_count : parsedElements.length,
          text: fullText,
          elements: parsedElements,
        };

        const elementTypes = parsedElements.map((e) => e.type);
        console.log(
          `[UNSTRUCTURED_RESPONSE] success=${normalized.success} filename="${normalized.filename}" element_count=${normalized.element_count} text_len=${normalized.text.length} element_types=[${elementTypes.join(", ")}]`
        );

        return normalized;
      } catch (err: any) {
        const isNetworkOrTimeout =
          err.name === "AbortError" ||
          err.code === "ECONNREFUSED" ||
          err.message?.includes("fetch failed") ||
          err.message?.includes("Connection refused");

        // Attempt 1 retry after 3s delay for Render free-tier cold starts
        if (!isRetry && isNetworkOrTimeout) {
          console.warn(
            `[ExtractionClient Cold Start] Initial request failed (${err.message}). Render instance may be spinning up from cold start. Retrying in 3s...`
          );
          await new Promise((res) => setTimeout(res, 3000));
          return executeRequest(true);
        }

        if (err.name === "AbortError") {
          console.error(`[ExtractionClient Timeout] Request exceeded timeout of ${timeoutMs}ms`);
          throw new Error(
            `Document extraction timed out after ${Math.round(timeoutMs / 1000)}s (Service at ${serviceBaseUrl} may be waking up from Render free-tier cold start).`
          );
        }

        if (err.code === "ECONNREFUSED" || err.message?.includes("fetch failed") || err.message?.includes("Connection refused")) {
          console.error(`[ExtractionClient Connection Error] Cannot reach extraction service at ${extractEndpoint}`);
          throw new Error(
            `Document extraction network error: Unable to connect to service at ${serviceBaseUrl}. Verify service is online and CORS is enabled.`
          );
        }

        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    return executeRequest(false);
  }
}
