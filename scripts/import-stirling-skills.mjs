/**
 * Import Stirling PDF OpenAPI operations as Aporto Skills + Providers.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-stirling-skills.mjs
 *   node --env-file=.env.local scripts/import-stirling-skills.mjs --apply
 */

import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = parseArgs(process.argv.slice(2));
const APPLY = args.apply === true;
const SKIP_EMBEDDINGS = args.skipEmbeddings === true;
const OPENAPI_FILE = String(args.openapiFile ?? "tmp/stirling-openapi.json");
const REVIEW_FILE = String(args.reviewFile ?? "tmp/stirling-skills-review.json");
const BASE_URL = process.env.NEXTAUTH_URL ?? "https://app.aporto.tech";
const PROVIDER_ENDPOINT = `${BASE_URL}/api/providers/stirling`;
const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://api.aporto.tech";
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;

const publisherEnv = readEnvFile("/Users/igortkachenko/Downloads/publisher/.env");
const PUBLISHER_API_KEY = process.env.STIRLING_PUBLISHER_API_KEY
    ?? process.env.PUBLISHER_API_KEY
    ?? publisherEnv.PUBLISHER_API_KEY;
const STIRLING_GLOBAL_API_KEY = process.env.STIRLING_GLOBAL_API_KEY
    ?? publisherEnv.STIRLING_GLOBAL_API_KEY;
const STIRLING_OPENAPI_URL = process.env.STIRLING_OPENAPI_URL
    ?? "https://yieldcars.com/publisher/stirling/v1/api-docs";
const STIRLING_API_BASE_URL = process.env.STIRLING_API_BASE_URL
    ?? "https://yieldcars.com/publisher/stirling";

const INCLUDED_TAGS = new Set([
    "Convert",
    "General",
    "Misc",
    "Security",
    "Forms",
    "Filter",
    "Analysis",
    "Pipeline",
    "AI Tools",
]);

const SKIP_OPERATION_IDS = new Set([
    "importDatabase",
    "uploadLicenseFile",
    "uploadServerCertificate",
    "createSession",
    "submitSignature",
    "signDocument",
    "validateCertificate",
    "validateCertificate_1",
]);

const FORMAT_VARIANTS = {
    convertToPdf: [
        ["PNG", { acceptedInputFormat: "png" }],
        ["JPEG", { acceptedInputFormat: "jpeg" }],
        ["JPG", { acceptedInputFormat: "jpg" }],
        ["WEBP", { acceptedInputFormat: "webp" }],
        ["GIF", { acceptedInputFormat: "gif" }],
        ["BMP", { acceptedInputFormat: "bmp" }],
        ["TIFF", { acceptedInputFormat: "tiff" }],
    ].map(([from, fixedParams]) => ({
        name: `${from} to PDF Converter`,
        fixedParams,
        inputTypes: [`image/${String(from).toLowerCase().replace("jpg", "jpeg")}`],
        outputTypes: ["application/pdf", "file/pdf"],
        tags: [String(from).toLowerCase(), "image-to-pdf"],
    })),
    convertToImage: ["png", "jpeg", "jpg", "gif", "webp"].map((format) => ({
        name: `PDF to ${format.toUpperCase()} Converter`,
        fixedParams: { imageFormat: format },
        inputTypes: ["application/pdf", "file/pdf"],
        outputTypes: [`image/${format === "jpg" ? "jpeg" : format}`, `file/${format}`],
        tags: ["pdf-to-image", format],
        responseExtension: format === "jpeg" ? "jpg" : format,
    })),
    processPdfToWord: ["doc", "docx", "odt"].map((format) => ({
        name: `PDF to ${format.toUpperCase()} Converter`,
        fixedParams: { outputFormat: format },
        inputTypes: ["application/pdf", "file/pdf"],
        outputTypes: [`file/${format}`],
        tags: ["pdf-to-word", format],
        responseExtension: format,
    })),
    processPdfToRTForTXT: ["txt", "rtf"].map((format) => ({
        name: `PDF to ${format.toUpperCase()} Converter`,
        fixedParams: { outputFormat: format },
        inputTypes: ["application/pdf", "file/pdf"],
        outputTypes: [`text/${format}`, `file/${format}`],
        tags: ["pdf-to-text", format],
        responseExtension: format,
    })),
    processPdfToPresentation: ["ppt", "pptx", "odp"].map((format) => ({
        name: `PDF to ${format.toUpperCase()} Converter`,
        fixedParams: { outputFormat: format },
        inputTypes: ["application/pdf", "file/pdf"],
        outputTypes: [`file/${format}`],
        tags: ["pdf-to-presentation", format],
        responseExtension: format,
    })),
    convertPdfToVector: ["eps", "ps", "pcl", "xps"].map((format) => ({
        name: `PDF to ${format.toUpperCase()} Converter`,
        fixedParams: { outputFormat: format, prepress: false },
        inputTypes: ["application/pdf", "file/pdf"],
        outputTypes: [`file/${format}`],
        tags: ["pdf-to-vector", format],
        responseExtension: format,
    })),
    pdfToPdfA: ["pdfa", "pdfa-1", "pdfa-2", "pdfa-2b", "pdfa-3", "pdfa-3b", "pdfx"].map((format) => ({
        name: `PDF to ${format.toUpperCase()} Converter`,
        fixedParams: { outputFormat: format },
        inputTypes: ["application/pdf", "file/pdf"],
        outputTypes: ["application/pdf", "file/pdf"],
        tags: ["pdf-a", format],
        responseExtension: "pdf",
    })),
};

const OPERATION_NAME_OVERRIDES = {
    verifyPDF: "PDF Standards Compliance Checker",
    validateSignature: "PDF Digital Signature Validator",
    timestampPdf: "PDF Timestamp Adder",
    sanitizePDF: "PDF Sanitizer",
    removePassword: "PDF Password Remover",
    removeCertSignPDF: "PDF Digital Signature Remover",
    redactPdfManual: "PDF Manual Redactor",
    getPdfInfo: "PDF Information Extractor",
    signPDFWithCert: "PDF Certificate Signer",
    redactPdfAuto: "PDF Auto Redactor",
    addWatermark: "PDF Watermark Adder",
    addPassword: "PDF Password Protector",
    handleData: "PDF Pipeline Runner",
    metadata: "PDF Metadata Editor",
    unlockPDFForms: "PDF Form Unlocker",
    extractHeader: "PDF JavaScript Extractor",
    scannerEffect: "PDF Scanner Effect",
    replaceAndInvertColor: "PDF Color Replacer and Inverter",
    repairPdf: "PDF Repair Tool",
    renameAttachment: "PDF Attachment Renamer",
    removeBlankPages: "PDF Blank Page Remover",
    processPdfWithOCR: "PDF OCR Processor",
    listAttachments: "PDF Attachment Lister",
    flatten: "PDF Flattener",
    extractImages: "PDF Image Extractor",
    extractImageScans: "Document Image Scan Extractor",
    extractAttachments: "PDF Attachment Extractor",
    deleteAttachment: "PDF Attachment Deleter",
    decompressPdf: "PDF Decompressor",
    optimizePdf: "PDF Compressor",
    autoSplitPdf: "PDF Auto Splitter",
    extractHeader_1: "PDF Auto Renamer",
    addStamp: "PDF Stamp Adder",
    addPageNumbers: "PDF Page Number Adder",
    overlayImage: "PDF Image Overlay",
    addComments: "PDF Comment Adder",
    addAttachments: "PDF Attachment Adder",
    splitPdf: "PDF Section Splitter",
    splitPdf_1: "PDF Chapter Splitter",
    splitPdf_2: "PDF Page Splitter",
    posterPdf: "PDF Poster Print Splitter",
    autoSplitPdf_1: "PDF Size or Count Splitter",
    scalePages: "PDF Page Scaler",
    rotatePDF: "PDF Rotator",
    deletePages: "PDF Page Remover",
    removeImages: "PDF Image Remover",
    rearrangePages: "PDF Page Rearranger",
    pdfToSinglePage: "PDF to Single Page Converter",
    overlayPdfs: "PDF Overlay Tool",
    mergeMultiplePagesIntoOne: "PDF Multi-Page Layout Tool",
    mergePdfs: "PDF Merger",
    extractBookmarks: "PDF Bookmark Extractor",
    editText: "PDF Text Editor",
    editTableOfContents: "PDF Table of Contents Editor",
    cropPdf: "PDF Cropper",
    createBookletImposition: "PDF Booklet Imposition Tool",
    modifyFields: "PDF Form Field Modifier",
    fillForm: "PDF Form Filler",
    listFields: "PDF Form Field Inspector",
    listFieldsWithCoordinates: "PDF Form Field Coordinate Inspector",
    extractXlsx: "PDF Form to XLSX Extractor",
    extractCsv: "PDF Form to CSV Extractor",
    deleteFields: "PDF Form Field Deleter",
    pageSize: "PDF Page Size Filter",
    pageRotation: "PDF Page Rotation Filter",
    pageCount: "PDF Page Count Filter",
    fileSize: "PDF File Size Filter",
    containsText: "PDF Text Presence Checker",
    containsImage: "PDF Image Presence Checker",
    convertGhostscriptInputsToPdf: "PostScript to PDF Converter",
    urlToPdf: "URL to PDF Converter",
    convertJsonToPdf: "Text Editor JSON to PDF Converter",
    convertSvgToPdf: "SVG to PDF Converter",
    processPdfToXML: "PDF to XML Converter",
    pdfToExcel: "PDF to XLSX Converter",
    convertPdfToJson: "PDF to Text Editor JSON Converter",
    exportPartialPdf: "Text Editor JSON to Partial PDF Converter",
    extractPdfMetadata: "PDF Text Editor Metadata Extractor",
    clearCache: "PDF Text Editor Cache Cleaner",
    processPdfToMarkdown: "PDF to Markdown Converter",
    processPdfToHTML: "PDF to HTML Converter",
    convertPdfToEpub: "PDF to EPUB/AZW3 Converter",
    pdfToCsv: "PDF to CSV Extractor",
    convertPdfToCbz: "PDF to CBZ Converter",
    convertPdfToCbr: "PDF to CBR Converter",
    markdownToPdf: "Markdown to PDF Converter",
    HtmlToPdf: "HTML to PDF Converter",
    processFileToPDF: "Office Document to PDF Converter",
    convertEmlToPdf: "EML/MSG to PDF Converter",
    convertEbookToPdf: "Ebook to PDF Converter",
    convertCbzToPdf: "CBZ to PDF Converter",
    convertCbrToPdf: "CBR to PDF Converter",
    getSecurityInfo: "PDF Security Analyzer",
    getPageDimensions: "PDF Page Dimension Analyzer",
    getPageCount: "PDF Page Count Analyzer",
    getFormFields: "PDF Form Field Analyzer",
    getFontInfo: "PDF Font Analyzer",
    getDocumentProperties: "PDF Document Property Analyzer",
    getBasicInfo: "PDF Basic Information Analyzer",
    getAnnotationInfo: "PDF Annotation Analyzer",
    pdfCommentAgent: "PDF AI Comment Agent",
    mathAuditorAgent: "PDF Math Auditor Agent",
};

function parseArgs(argv) {
    const out = {};
    for (const arg of argv) {
        if (arg === "--apply") out.apply = true;
        else if (arg === "--skip-embeddings") out.skipEmbeddings = true;
        else if (arg.includes("=")) {
            const [key, value] = arg.replace(/^--/, "").split("=");
            out[key] = value;
        }
    }
    return out;
}

function readEnvFile(file) {
    if (!existsSync(file)) return {};
    return Object.fromEntries(
        readFileSync(file, "utf8")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#") && line.includes("="))
            .map((line) => {
                const index = line.indexOf("=");
                return [
                    line.slice(0, index),
                    line.slice(index + 1).replace(/^"|"$/g, ""),
                ];
            }),
    );
}

async function fetchOpenApi() {
    if (existsSync(OPENAPI_FILE)) {
        return JSON.parse(await fs.readFile(OPENAPI_FILE, "utf8"));
    }
    if (!PUBLISHER_API_KEY || !STIRLING_GLOBAL_API_KEY) {
        throw new Error("Missing PUBLISHER_API_KEY/STIRLING_GLOBAL_API_KEY for OpenAPI fetch");
    }
    const res = await fetch(STIRLING_OPENAPI_URL, {
        headers: {
            "X-Publisher-API-Key": PUBLISHER_API_KEY,
            "X-API-KEY": STIRLING_GLOBAL_API_KEY,
        },
    });
    if (!res.ok) throw new Error(`OpenAPI fetch failed ${res.status}: ${await res.text()}`);
    const data = await res.json();
    await fs.mkdir("tmp", { recursive: true });
    await fs.writeFile(OPENAPI_FILE, JSON.stringify(data, null, 2));
    return data;
}

function resolve(openapi, value) {
    if (!value || !value.$ref) return value;
    return value.$ref.split("/").slice(1).reduce((node, key) => node?.[key], openapi);
}

function deref(openapi, value, depth = 0) {
    if (!value || depth > 8) return value;
    const resolved = resolve(openapi, value);
    if (resolved?.allOf) {
        return resolved.allOf.map((item) => deref(openapi, item, depth + 1)).reduce((acc, item) => ({
            ...acc,
            ...item,
            required: [...new Set([...(acc.required ?? []), ...(item.required ?? [])])],
            properties: { ...(acc.properties ?? {}), ...(item.properties ?? {}) },
        }), {});
    }
    return resolved;
}

function schemaForOperation(openapi, operation) {
    const content = operation.requestBody?.content ?? {};
    const contentType = content["multipart/form-data"]
        ? "multipart/form-data"
        : content["application/json"]
            ? "application/json"
            : Object.keys(content)[0] ?? "multipart/form-data";
    const schema = deref(openapi, content[contentType]?.schema) ?? { type: "object", properties: {} };
    const properties = Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [key, deref(openapi, value)]),
    );
    return { contentType, schema: { ...schema, properties } };
}

function isBinaryField(field) {
    return field?.format === "binary" || (field?.type === "array" && field?.items?.format === "binary");
}

function defaultsFromSchema(schema) {
    const defaults = {};
    for (const [key, field] of Object.entries(schema.properties ?? {})) {
        if (field?.default !== undefined && !isBinaryField(field)) defaults[key] = field.default;
    }
    return defaults;
}

function wordsFromOperation(operation) {
    const text = operation.summary || operation.operationId || "";
    return text
        .replace(/\bPDF\b/gi, "PDF")
        .replace(/\bOCR\b/gi, "OCR")
        .replace(/\s+/g, " ")
        .trim();
}

function genericName(operation) {
    if (OPERATION_NAME_OVERRIDES[operation.operationId]) return OPERATION_NAME_OVERRIDES[operation.operationId];
    const summary = wordsFromOperation(operation);
    if (!summary) return titleCase(operation.operationId ?? "Stirling PDF Tool");
    if (/^Convert\b/i.test(summary)) return summary.replace(/^Convert\s+/i, "").replace(/\s+file$/i, "").replace(/\bto\b/i, "to").replace(/^(.+)$/, (s) => `${s} Converter`);
    if (/^Extracts?\b/i.test(summary)) return summary.replace(/^Extracts?\s+/i, "PDF ").replace(/\s+from (a )?PDF( file)?/i, " Extractor");
    if (/^Remove\b/i.test(summary)) return summary.replace(/^Remove\s+/i, "PDF ").replace(/\s+from (a )?PDF( file)?/i, " Remover");
    if (/^Add\b/i.test(summary)) return summary.replace(/^Add\s+/i, "PDF ").replace(/\s+to (a )?PDF( file)?/i, " Adder");
    if (/^Get\b/i.test(summary)) return summary.replace(/^Get\s+/i, "PDF ");
    return summary.replace(/\s+a PDF file/i, "").replace(/\s+PDF file/i, " PDF");
}

function titleCase(value) {
    return String(value)
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function capabilitiesFor(skill) {
    const text = `${skill.name} ${skill.description} ${skill.path}`.toLowerCase();
    const caps = ["pdf"];
    for (const [cap, pattern] of [
        ["convert", /convert|to pdf|to png|to jpeg|to doc|to word|to text|to html|to csv|to markdown|to epub/],
        ["merge", /merge|combine/],
        ["split", /split/],
        ["rotate", /rotate/],
        ["compress", /compress|optimize/],
        ["ocr", /\bocr\b/],
        ["redact", /redact/],
        ["watermark", /watermark/],
        ["sign", /sign|signature|certificate/],
        ["secure", /password|sanitize|security|encrypt|decrypt/],
        ["extract", /extract|list|get|inspect|analysis|info/],
        ["edit", /edit|rearrange|crop|scale|flatten|stamp|number|attachment|metadata|comment/],
        ["filter", /filter|contains|page count|file size/],
    ]) {
        if (pattern.test(text)) caps.push(cap);
    }
    return [...new Set(caps)];
}

function inferOutputTypes(operation, variant) {
    if (variant?.outputTypes) return variant.outputTypes;
    const text = `${operation.summary ?? ""} ${operation.operationId ?? ""}`.toLowerCase();
    if (/json|info|list|inspect|filter|validate|verify|analysis|count|properties/.test(text)) return ["json"];
    if (/csv/.test(text)) return ["text/csv", "file/csv"];
    if (/xlsx|excel/.test(text)) return ["file/xlsx"];
    if (/markdown/.test(text)) return ["text/markdown", "file/md"];
    if (/html/.test(text)) return ["text/html", "file/html"];
    if (/xml/.test(text)) return ["application/xml", "file/xml"];
    if (/image|png|jpeg|jpg|webp|gif/.test(text)) return ["image", "file/zip"];
    return ["application/pdf", "file/pdf"];
}

function inferInputTypes(operation, variant) {
    if (variant?.inputTypes) return variant.inputTypes;
    const text = `${operation.summary ?? ""} ${operation.operationId ?? ""}`.toLowerCase();
    if (/url to pdf/.test(text)) return ["text/url"];
    if (/html/.test(text)) return ["text/html", "file/html", "file/zip"];
    if (/markdown/.test(text)) return ["text/markdown", "file/md"];
    if (/svg/.test(text)) return ["image/svg+xml", "file/svg"];
    if (/image|img/.test(text) && /to pdf/.test(text)) return ["image", "file/image"];
    return ["application/pdf", "file/pdf"];
}

function responseExtension(operation, variant) {
    if (variant?.responseExtension) return variant.responseExtension;
    const output = inferOutputTypes(operation, variant).find((item) => item.startsWith("file/"));
    return output?.split("/")[1] ?? undefined;
}

function paramsSchema(schema) {
    const out = {
        fileInput: "file URL, base64 string, or array of file URLs/base64 strings for multi-file operations",
    };
    for (const [key, field] of Object.entries(schema.properties ?? {})) {
        if (key === "fileInput") continue;
        const type = isBinaryField(field) ? "file" : field.type ?? "string";
        const enumText = Array.isArray(field.enum) ? ` (${field.enum.join("|")})` : "";
        const defaultText = field.default !== undefined ? `, default: ${field.default}` : "";
        out[key] = `${type}${enumText}${defaultText}${field.description ? ` — ${field.description}` : ""}`;
    }
    return out;
}

function shouldInclude(operation) {
    if (SKIP_OPERATION_IDS.has(operation.operationId)) return false;
    return (operation.tags ?? []).some((tag) => INCLUDED_TAGS.has(tag));
}

function buildSkillDefs(openapi) {
    const defs = [];
    for (const [path, methods] of Object.entries(openapi.paths ?? {})) {
        for (const [method, operation] of Object.entries(methods)) {
            if (method !== "post" || !shouldInclude(operation)) continue;

            const { contentType, schema } = schemaForOperation(openapi, operation);
            const variants = FORMAT_VARIANTS[operation.operationId] ?? [{ name: genericName(operation), fixedParams: {} }];
            for (const variant of variants) {
                const fixedParams = { ...defaultsFromSchema(schema), ...(variant.fixedParams ?? {}) };
                const name = variant.name ?? genericName(operation);
                const description = `${operation.summary ?? name}. Powered by Stirling PDF through the Aporto publisher gateway. This free skill accepts file URLs or base64 file payloads and returns the processed file or JSON result.`;
                const tags = [...new Set([
                    "stirling",
                    "pdf",
                    ...(operation.tags ?? []).map(slug),
                    ...(variant.tags ?? []),
                    ...capabilitiesFor({ name, description, path }),
                ])];
                defs.push({
                    name,
                    description,
                    category: `document/${slug((operation.tags ?? ["pdf"])[0])}`,
                    capabilities: capabilitiesFor({ name, description, path }),
                    inputTypes: inferInputTypes(operation, variant),
                    outputTypes: inferOutputTypes(operation, variant),
                    tags,
                    paramsSchema: paramsSchema(schema),
                    inputSchema: schema,
                    path,
                    method: method.toUpperCase(),
                    contentType,
                    fixedParams,
                    responseExtension: responseExtension(operation, variant),
                    operationId: operation.operationId,
                    summary: operation.summary,
                    providerName: `Stirling PDF - ${name}`,
                });
            }
        }
    }
    return dedupeByName(defs);
}

function dedupeByName(defs) {
    const seen = new Map();
    for (const def of defs) {
        const prior = seen.get(def.name);
        if (!prior) seen.set(def.name, def);
        else seen.set(`${def.name} (${def.operationId})`, { ...def, name: `${def.name} (${def.operationId})` });
    }
    return Array.from(seen.values());
}

async function embedText(text) {
    if (!NEWAPI_ADMIN_KEY) throw new Error("NEWAPI_ADMIN_KEY is required for embeddings");
    const res = await fetch(`${NEWAPI_URL}/v1/embeddings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${NEWAPI_ADMIN_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) throw new Error(`Embed error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.data[0].embedding;
}

function buildEmbedText(skill) {
    return [
        `category:${skill.category}`,
        `capabilities:${skill.capabilities.join(",")}`,
        `input:${skill.inputTypes.join(",")}`,
        `output:${skill.outputTypes.join(",")}`,
        `${skill.name}: ${skill.description}`,
    ].join(" ");
}

async function upsertSkill(def) {
    const capabilities = JSON.stringify(def.capabilities);
    const inputTypes = JSON.stringify(def.inputTypes);
    const outputTypes = JSON.stringify(def.outputTypes);
    const tags = JSON.stringify(def.tags);
    const params = JSON.stringify(def.paramsSchema);
    const inputSchema = JSON.stringify(def.inputSchema);
    const embedding = SKIP_EMBEDDINGS ? null : await embedText(buildEmbedText(def));
    const existing = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Skill" WHERE name = $1 LIMIT 1`,
        def.name,
    ))[0];
    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Skill"
             SET description = $2, category = $3, capabilities = $4, "inputTypes" = $5,
                 "outputTypes" = $6, tags = $7, "paramsSchema" = $8, "inputSchema" = $9,
                 embedding = COALESCE($10::vector, embedding), status = 'live', "isActive" = true
             WHERE id = $1`,
            existing.id,
            def.description,
            def.category,
            capabilities,
            inputTypes,
            outputTypes,
            tags,
            params,
            inputSchema,
            embedding ? `[${embedding.join(",")}]` : null,
        );
        return { id: existing.id, created: false };
    }

    const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO "Skill" (name, description, category, capabilities, "inputTypes", "outputTypes", tags, "paramsSchema", "inputSchema", embedding, status, "isActive")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, 'live', true)
         RETURNING id`,
        def.name,
        def.description,
        def.category,
        capabilities,
        inputTypes,
        outputTypes,
        tags,
        params,
        inputSchema,
        embedding ? `[${embedding.join(",")}]` : null,
    );
    return { id: rows[0].id, created: true };
}

async function upsertProvider(skillId, def) {
    const syncConfig = JSON.stringify({
        apiBaseUrl: STIRLING_API_BASE_URL,
        path: def.path,
        method: def.method,
        contentType: def.contentType,
        stirlingApiKey: STIRLING_GLOBAL_API_KEY,
        fixedParams: def.fixedParams,
        fields: def.inputSchema.properties ?? {},
        responseExtension: def.responseExtension,
        timeoutMs: 240_000,
        responseCapBytes: 8_388_608,
        source: "stirling-openapi",
        operationId: def.operationId,
        importedAt: new Date().toISOString(),
    });

    const existing = (await prisma.$queryRawUnsafe(
        `SELECT id FROM "Provider" WHERE name = $1 AND "skillId" = $2 LIMIT 1`,
        def.providerName,
        skillId,
    ))[0];
    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "Provider"
             SET endpoint = $2, "isActive" = true, "pricePerCall" = 0,
                 "providerSecret" = $3, "syncConfig" = $4
             WHERE id = $1`,
            existing.id,
            PROVIDER_ENDPOINT,
            PUBLISHER_API_KEY,
            syncConfig,
        );
        return { id: existing.id, created: false };
    }
    const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO "Provider" (name, "skillId", endpoint, "isActive", "pricePerCall", "providerSecret", "syncConfig")
         VALUES ($1, $2, $3, true, 0, $4, $5)
         RETURNING id`,
        def.providerName,
        skillId,
        PROVIDER_ENDPOINT,
        PUBLISHER_API_KEY,
        syncConfig,
    );
    return { id: rows[0].id, created: true };
}

async function main() {
    const openapi = await fetchOpenApi();
    const defs = buildSkillDefs(openapi);
    await fs.mkdir("tmp", { recursive: true });
    await fs.writeFile(REVIEW_FILE, JSON.stringify(defs, null, 2));
    console.log(`Generated ${defs.length} Stirling skill definitions.`);
    console.log(`Review file: ${REVIEW_FILE}`);

    if (!APPLY) {
        console.log("Dry run only. Re-run with --apply to write Skill/Provider rows.");
        return;
    }
    if (!PUBLISHER_API_KEY) throw new Error("PUBLISHER_API_KEY is required");
    if (!STIRLING_GLOBAL_API_KEY) throw new Error("STIRLING_GLOBAL_API_KEY is required");

    let skillsCreated = 0;
    let skillsUpdated = 0;
    let providersCreated = 0;
    let providersUpdated = 0;
    for (const def of defs) {
        const skill = await upsertSkill(def);
        if (skill.created) skillsCreated += 1;
        else skillsUpdated += 1;
        const provider = await upsertProvider(skill.id, def);
        if (provider.created) providersCreated += 1;
        else providersUpdated += 1;
        console.log(`${skill.created ? "+" : "↺"} ${def.name}`);
    }

    console.log(`
Stirling import complete.
Skills created: ${skillsCreated}
Skills updated: ${skillsUpdated}
Providers created: ${providersCreated}
Providers updated: ${providersUpdated}
Price per call: $0
`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
