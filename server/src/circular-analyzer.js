import { PDFParse } from "pdf-parse";
import { readEnv } from "./env.js";

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const MAX_ANALYSIS_CHARS = 14000;
const MAX_OCR_PAGES = 5;

function groqChatCompletionsUrl() {
  const url = readEnv("GROQ_CHAT_COMPLETIONS_URL");
  if (!url) {
    throw new Error("GROQ_CHAT_COMPLETIONS_URL must be set when GROQ_API_KEY is configured.");
  }

  return url;
}

function cleanText(value = "") {
  return String(value)
    .replace(/\u0000/g, " ")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForMatch(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactLine(value = "", maxLength = 160) {
  const line = cleanText(value).replace(/\s+/g, " ").trim();
  return line.length > maxLength ? `${line.slice(0, maxLength - 1).trim()}...` : line;
}

function extractJson(content = "") {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Groq returned a response that was not JSON.");
  }

  return JSON.parse(match[0]);
}

async function extractPdfText(file) {
  const parser = new PDFParse({ data: file.buffer });

  try {
    const result = await parser.getText();
    const text = cleanText(result.text || "");

    return {
      text,
      totalPages: result.total || result.pages?.length || 1,
    };
  } finally {
    await parser.destroy();
  }
}

async function renderPdfImages(file, totalPages = 1) {
  const parser = new PDFParse({ data: file.buffer });

  try {
    const pageNumbers = Array.from(
      { length: Math.min(MAX_OCR_PAGES, Math.max(1, totalPages)) },
      (_item, index) => index + 1,
    );
    const result = await parser.getScreenshot({ partial: pageNumbers, scale: 1 });

    return (result.pages || [])
      .map((page) => {
        if (page.dataUrl) {
          return page.dataUrl;
        }

        if (page.data) {
          const base64 = Buffer.from(page.data).toString("base64");
          return `data:image/png;base64,${base64}`;
        }

        return "";
      })
      .filter(Boolean);
  } finally {
    await parser.destroy();
  }
}

function titleFromFileName(fileName = "") {
  return compactLine(
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " "),
    140,
  );
}

function buildLocalSuggestion({ text, fileName, cells }) {
  const searchableText = [text, fileName].filter(Boolean).join("\n");
  const lines = searchableText
    .split(/\r?\n/)
    .map((line) => compactLine(line, 180))
    .filter((line) => line.length >= 5);

  const subjectLine = lines.find((line) => /^subject\s*[:\-]/i.test(line));
  const title = compactLine(
    subjectLine?.replace(/^subject\s*[:\-]\s*/i, "") ||
      lines.find((line) => !/^(date|from|to)\s*[:\-]/i.test(line)) ||
      titleFromFileName(fileName) ||
      "Circular",
    140,
  );

  const descriptionSeed = lines
    .filter((line) => line !== subjectLine && line !== title)
    .slice(0, 6)
    .join(" ");

  const description = compactLine(
    descriptionSeed || text.replace(/\s+/g, " ").slice(0, 420) || "Please review the attached circular.",
    520,
  );

  const normalizedText = normalizeForMatch(searchableText);
  const matchedCell =
    cells
      .map((cell) => ({
        ...cell,
        normalizedName: normalizeForMatch(cell.name),
      }))
      .filter((cell) => cell.normalizedName && normalizedText.includes(cell.normalizedName))
      .sort((a, b) => b.normalizedName.length - a.normalizedName.length)[0] ?? null;

  return {
    title,
    description,
    cellId: matchedCell?.id || "",
    cellName: matchedCell?.name || "",
    confidence: matchedCell ? 0.55 : 0.2,
    source: "local",
  };
}

function resolveCell(aiCell = {}, cells) {
  const candidates = [aiCell.id, aiCell.cellId, aiCell.name, aiCell.cellName]
    .filter(Boolean)
    .map(String);

  for (const candidate of candidates) {
    const byId = cells.find((cell) => cell.id === candidate);
    if (byId) {
      return byId;
    }
  }

  const normalizedCandidates = candidates.map(normalizeForMatch).filter(Boolean);
  for (const candidate of normalizedCandidates) {
    const byName = cells.find((cell) => normalizeForMatch(cell.name) === candidate);
    if (byName) {
      return byName;
    }
  }

  for (const candidate of normalizedCandidates) {
    const partial = cells.find((cell) => {
      const normalizedName = normalizeForMatch(cell.name);
      return normalizedName.includes(candidate) || candidate.includes(normalizedName);
    });
    if (partial) {
      return partial;
    }
  }

  return null;
}

async function askGroqForCircularMetadata({ text, fileName, cells }) {
  const apiKey = readEnv("GROQ_API_KEY");
  if (!apiKey) {
    return null;
  }

  const model = readEnv("GROQ_MODEL", DEFAULT_GROQ_MODEL);
  const cellList = cells.map((cell) => `- ${cell.id}: ${cell.name}`).join("\n");
  const analysisText = text.slice(0, MAX_ANALYSIS_CHARS);

  const response = await fetch(groqChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract metadata from college circular PDFs. Respond only with valid JSON. Do not invent names, dates, or cells that are not supported by the text.",
        },
        {
          role: "user",
          content: [
            "Return JSON with exactly these keys:",
            '{ "title": "short circular title", "description": "2-4 sentence recipient summary", "cell": { "id": "matching cell id or empty string", "name": "matching cell name or empty string", "confidence": 0.0 }, "reason": "short reason" }',
            "",
            "Choose the best target cell from this list only:",
            cellList,
            "",
            `PDF file name: ${fileName || "circular.pdf"}`,
            "",
            "PDF text:",
            analysisText,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq returned ${response.status} while analyzing the PDF.`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq did not return any analysis content.");
  }

  return extractJson(content);
}

async function askGroqForCircularImages({ imageUrls, fileName, cells }) {
  const apiKey = readEnv("GROQ_API_KEY");
  if (!apiKey) {
    return null;
  }

  const model = readEnv("GROQ_VISION_MODEL", DEFAULT_GROQ_VISION_MODEL);
  const cellList = cells.map((cell) => `- ${cell.id}: ${cell.name}`).join("\n");

  const response = await fetch(groqChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You read scanned college circular PDFs from page images. Respond only with valid JSON. Do not invent cells that are not supported by the image.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Read these PDF page images and return JSON with exactly these keys:",
                '{ "title": "short circular title", "description": "2-4 sentence recipient summary", "cell": { "id": "matching cell id or empty string", "name": "matching cell name or empty string", "confidence": 0.0 }, "reason": "short reason" }',
                "",
                "Choose the best target cell from this list only:",
                cellList,
                "",
                `PDF file name: ${fileName || "circular.pdf"}`,
              ].join("\n"),
            },
            ...imageUrls.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq Vision returned ${response.status} while reading the PDF image.`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq Vision did not return any OCR content.");
  }

  return extractJson(content);
}

function buildSuggestionFromGroq(aiResult, cells, fallback, source) {
  const resolvedCell = resolveCell(aiResult.cell ?? {}, cells);
  const confidence = Number(aiResult.cell?.confidence ?? fallback.confidence);
  const shouldUseAiCell = resolvedCell && Number.isFinite(confidence) && confidence >= 0.35;

  return {
    title: compactLine(aiResult.title || fallback.title, 140),
    description: compactLine(aiResult.description || fallback.description, 700),
    cellId: shouldUseAiCell ? resolvedCell.id : fallback.cellId,
    cellName: shouldUseAiCell ? resolvedCell.name : fallback.cellName,
    confidence: Number.isFinite(confidence) ? confidence : fallback.confidence,
    source,
    reason: compactLine(aiResult.reason || "", 220),
  };
}

export async function analyzeCircularUpload({ file, cells }) {
  const { text, totalPages } = await extractPdfText(file);
  const fallback = buildLocalSuggestion({
    text,
    fileName: file.originalname,
    cells,
  });

  if (!text) {
    try {
      const imageUrls = await renderPdfImages(file, totalPages);
      const aiResult = await askGroqForCircularImages({
        imageUrls,
        fileName: file.originalname,
        cells,
      });

      if (!aiResult) {
        return {
          ...fallback,
          warning:
            "This PDF is image-based. Add GROQ_API_KEY to enable OCR auto-fill for scanned PDFs.",
        };
      }

      return buildSuggestionFromGroq(aiResult, cells, fallback, "groq-vision");
    } catch (error) {
      return {
        ...fallback,
        warning: `This PDF is image-based, and OCR could not complete. ${error.message}`,
      };
    }
  }

  try {
    const aiResult = await askGroqForCircularMetadata({
      text,
      fileName: file.originalname,
      cells,
    });

    if (!aiResult) {
      return {
        ...fallback,
        warning: "GROQ_API_KEY is not configured, so a local text scan was used.",
      };
    }

    return buildSuggestionFromGroq(aiResult, cells, fallback, "groq");
  } catch (error) {
    return {
      ...fallback,
      warning: `Groq analysis could not complete, so a local text scan was used. ${error.message}`,
    };
  }
}
