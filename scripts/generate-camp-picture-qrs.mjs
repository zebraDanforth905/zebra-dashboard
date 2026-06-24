#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_YEAR = 2026;
const DEFAULT_WIDTH = 450;
const DEFAULT_MARGIN = 2;
const DEFAULT_COPIES = 1;
const MAX_COPIES = 100;
const FILE_BASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;

process.on('uncaughtException', handleFatalError);
process.on('unhandledRejection', handleFatalError);

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(usage());
  process.exit(0);
}

const year = parseIntegerOption(args.year ?? DEFAULT_YEAR, '--year');
const outDir = path.resolve(String(args['out-dir'] ?? `output/camp-picture-qrs/${year}`));
const payloadsFile = args.payloads ? path.resolve(String(args.payloads)) : null;
const copies = parseIntegerOption(args.copies ?? DEFAULT_COPIES, '--copies');
const dryRun = Boolean(args['dry-run']);

if (!Number.isInteger(year) || year < 2000) {
  throw new Error(`Invalid --year: ${args.year}`);
}

if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) {
  throw new Error(`Invalid --copies: ${args.copies}`);
}

const items = payloadsFile
  ? normalizePayloads(JSON.parse(await fs.readFile(payloadsFile, 'utf8')))
  : defaultCampWeeks(year);
const planned = prepareRecords(items, outDir, year);

if (dryRun) {
  console.log(`Dry run: would generate ${planned.length} QR codes in ${outDir}`);
  for (const item of planned) {
    console.log(`${item.pngFile}: ${item.payload}`);
  }
  process.exit(0);
}

await fs.mkdir(outDir, { recursive: true });

const generated = [];
const { PNG, QRCode, jsQR } = await loadQrRuntime();

for (const item of planned) {
  await QRCode.toFile(item.pngPath, item.payload, {
    type: 'png',
    width: DEFAULT_WIDTH,
    margin: DEFAULT_MARGIN,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  await QRCode.toFile(item.svgPath, item.payload, {
    type: 'svg',
    margin: DEFAULT_MARGIN,
    errorCorrectionLevel: 'M',
  });

  const decoded = await decodeQrPng(item.pngPath, PNG, jsQR);
  if (decoded !== item.payload) {
    throw new Error(`QR verification failed for ${item.pngFile}: decoded "${decoded}"`);
  }

  generated.push({
    ...item,
    decoded,
  });
}

await writeManifestFiles(outDir, year, generated);
await writePrintHtml(outDir, year, generated, copies, 'camp-picture-qr-labels.html', 'labels');
await writePrintHtml(outDir, year, generated, copies, 'camp-picture-qr-pages.html', 'pages');

console.log(`Generated ${generated.length} QR codes in ${outDir}`);
for (const item of generated) {
  console.log(`${item.pngFile}: ${item.payload}`);
}

function parseArgs(argv) {
  const options = new Map([
    ['year', { takesValue: true }],
    ['out-dir', { takesValue: true }],
    ['payloads', { takesValue: true }],
    ['copies', { takesValue: true }],
    ['dry-run', { takesValue: false }],
    ['help', { takesValue: false }],
  ]);
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') {
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const eqIndex = arg.indexOf('=');
    const key = eqIndex === -1 ? arg.slice(2) : arg.slice(2, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : arg.slice(eqIndex + 1);
    const option = options.get(key);
    if (!option) {
      throw new Error(`Unknown option: --${key}`);
    }

    if (!option.takesValue) {
      if (inlineValue !== undefined) {
        throw new Error(`--${key} does not take a value`);
      }

      parsed[key] = true;
      continue;
    }

    if (inlineValue !== undefined) {
      if (!inlineValue) {
        throw new Error(`Missing value for --${key}`);
      }

      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    parsed[key] = next;
    i += 1;
  }

  return parsed;
}

function parseIntegerOption(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${optionName}: ${value}`);
  }

  return parsed;
}

function normalizePayloads(raw) {
  const payloads = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(payloads)) {
    throw new Error('Payload file must be an array or an object with an items array.');
  }

  return payloads.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Payload item at index ${index} must be an object.`);
    }

    const week = Number(item.week ?? index + 1);
    if (!Number.isInteger(week) || week < 1 || week > 53) {
      throw new Error(`Invalid week at payload index ${index}`);
    }

    return {
      week,
      day: normalizeOptionalString(item.day),
      startDate: normalizeOptionalDate(item.startDate ?? item.start_date, 'startDate', index),
      endDate: normalizeOptionalDate(item.endDate ?? item.end_date, 'endDate', index),
      label: normalizeOptionalString(item.label) ?? `Week ${week}`,
      group: normalizeOptionalString(item.group),
      room: normalizeOptionalString(item.room),
      targetUrl: normalizeOptionalString(item.targetUrl ?? item.target_url),
      payload: normalizeOptionalString(item.payload ?? item.targetUrl ?? item.target_url),
      fileBase: normalizeOptionalString(item.fileBase ?? item.file_base),
    };
  });
}

function defaultCampWeeks(campYear) {
  if (campYear === 2026) {
    return [
      week(1, '2026-06-29', '2026-07-03'),
      week(2, '2026-07-06', '2026-07-10'),
      week(3, '2026-07-13', '2026-07-17'),
      week(4, '2026-07-20', '2026-07-24'),
      week(5, '2026-07-27', '2026-07-31'),
      week(6, '2026-08-04', '2026-08-07'),
      week(7, '2026-08-10', '2026-08-14'),
      week(8, '2026-08-17', '2026-08-21'),
      week(9, '2026-08-24', '2026-08-28'),
      week(10, '2026-08-31', '2026-09-04'),
    ];
  }

  throw new Error(`No built-in camp week schedule for ${campYear}. Provide --payloads for non-2026 QR sets.`);
}

function week(number, startDate, endDate) {
  return {
    week: number,
    day: null,
    startDate,
    endDate,
    label: `Week ${number}`,
    group: null,
    room: null,
    targetUrl: null,
    payload: null,
    fileBase: `Week${number}_QRCode`,
  };
}

function prepareRecords(records, targetDir, campYear) {
  const prepared = records.map((item, index) => {
    const basename = normalizeFileBase(item.fileBase ?? `Week${item.week}_QRCode`, index);
    const pngFile = `${basename}.png`;
    const svgFile = `${basename}.svg`;
    const payload = normalizePayload(item.payload ?? item.targetUrl ?? safeTextPayload(item, campYear), index);

    return {
      ...item,
      payload,
      fileBase: basename,
      pngFile,
      svgFile,
      pngPath: safeOutputPath(targetDir, pngFile),
      svgPath: safeOutputPath(targetDir, svgFile),
    };
  });

  assertUniqueOutputFiles(prepared);
  return prepared;
}

function safeTextPayload(item, campYear) {
  const pieces = [
    'zebra-camp-picture',
    `year=${campYear}`,
    `week=${item.week}`,
    item.day ? `day=${item.day}` : null,
    item.startDate ? `start=${item.startDate}` : null,
    item.endDate ? `end=${item.endDate}` : null,
    item.group ? `group=${item.group}` : null,
    item.room ? `room=${item.room}` : null,
  ].filter(Boolean);

  return pieces.join(';');
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeOptionalDate(value, fieldName, index) {
  const text = normalizeOptionalString(value);
  if (!text) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Invalid ${fieldName} at payload index ${index}: ${text}`);
  }

  return text;
}

function normalizePayload(value, index) {
  const payload = normalizeOptionalString(value);
  if (!payload) {
    throw new Error(`Missing QR payload at item index ${index}`);
  }

  return payload;
}

function normalizeFileBase(value, index) {
  const fileBase = normalizeOptionalString(value);
  if (!fileBase) {
    throw new Error(`Missing fileBase at item index ${index}`);
  }

  if (
    fileBase === '.'
    || fileBase === '..'
    || fileBase.includes('/')
    || fileBase.includes('\\')
    || path.isAbsolute(fileBase)
    || !FILE_BASE_PATTERN.test(fileBase)
    || /\.(png|svg)$/i.test(fileBase)
  ) {
    throw new Error(
      `Unsafe fileBase at item index ${index}: use letters, numbers, spaces, dots, dashes, or underscores only, without an extension.`,
    );
  }

  return fileBase;
}

function safeOutputPath(targetDir, fileName) {
  const resolvedDir = path.resolve(targetDir);
  const resolvedPath = path.resolve(resolvedDir, fileName);
  const relative = path.relative(resolvedDir, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside output directory: ${fileName}`);
  }

  return resolvedPath;
}

function assertUniqueOutputFiles(records) {
  const seen = new Set();
  for (const record of records) {
    for (const fileName of [record.pngFile, record.svgFile]) {
      const key = fileName.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`Duplicate output file name: ${fileName}`);
      }
      seen.add(key);
    }
  }
}

async function loadQrRuntime() {
  const [qrcodeModule, jsQrModule, pngjsModule] = await Promise.all([
    import('qrcode'),
    import('jsqr'),
    import('pngjs'),
  ]);

  return {
    QRCode: qrcodeModule.default ?? qrcodeModule,
    jsQR: jsQrModule.default ?? jsQrModule,
    PNG: (pngjsModule.default ?? pngjsModule).PNG,
  };
}

async function decodeQrPng(filePath, PNG, jsQR) {
  const buffer = await fs.readFile(filePath);
  const png = PNG.sync.read(buffer);
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return code?.data ?? '';
}

async function writeManifestFiles(targetDir, campYear, records) {
  const manifest = {
    year: campYear,
    generatedAt: new Date().toISOString(),
    privacy: 'QR payloads contain only Drive folder URLs or non-sensitive camp week metadata.',
    items: records.map((item) => manifestRecord(item)),
  };

  await fs.writeFile(
    path.join(targetDir, 'camp-picture-qr-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const headers = [
    'week',
    'day',
    'start_date',
    'end_date',
    'label',
    'group',
    'room',
    'payload',
    'png_file',
    'svg_file',
  ];
  const rows = records.map((item) => [
    item.week,
    item.day,
    item.startDate,
    item.endDate,
    item.label,
    item.group,
    item.room,
    item.payload,
    item.pngFile,
    item.svgFile,
  ]);

  await fs.writeFile(
    path.join(targetDir, 'camp-picture-qr-manifest.csv'),
    `${toCsv([headers, ...rows])}\n`,
  );
}

function manifestRecord(item) {
  return {
    week: item.week,
    day: item.day,
    startDate: item.startDate,
    endDate: item.endDate,
    label: item.label,
    group: item.group,
    room: item.room,
    payload: item.payload,
    pngFile: item.pngFile,
    svgFile: item.svgFile,
    decoded: item.decoded,
  };
}

async function writePrintHtml(targetDir, campYear, records, copyCount, fileName, mode) {
  const expanded = records.flatMap((record) => (
    Array.from({ length: copyCount }, (_, copyIndex) => ({ ...record, copyIndex }))
  ));
  const csv = toCsv([
    ['week', 'start_date', 'end_date', 'payload'],
    ...records.map((item) => [item.week, item.startDate, item.endDate, item.payload]),
  ]);
  const cards = expanded.map((item) => labelMarkup(item, mode)).join('\n');
  const layoutClass = mode === 'pages' ? 'pages' : 'labels';
  const title = mode === 'pages'
    ? `${campYear} Camp Picture QR Pages`
    : `${campYear} Camp Picture QR Labels`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color: #111827;
      font-family: Arial, sans-serif;
    }
    body {
      margin: 0;
      background: #f8fafc;
    }
    .toolbar {
      align-items: center;
      background: #ffffff;
      border-bottom: 1px solid #d1d5db;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      padding: 12px 16px;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .toolbar h1 {
      font-size: 18px;
      margin: 0;
    }
    .toolbar button,
    .toolbar a {
      background: #111827;
      border: 0;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      display: inline-flex;
      font-size: 13px;
      line-height: 1;
      padding: 10px 12px;
      text-decoration: none;
    }
    .sheet {
      box-sizing: border-box;
      margin: 0 auto;
      padding: 0.35in;
      width: 8.5in;
    }
    .labels {
      display: grid;
      gap: 0.16in;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .label {
      align-items: center;
      background: #ffffff;
      border: 1px solid #111827;
      box-sizing: border-box;
      break-inside: avoid;
      display: grid;
      gap: 0.16in;
      grid-template-columns: 1.35in minmax(0, 1fr);
      min-height: 1.82in;
      padding: 0.14in;
    }
    .label img {
      height: 1.25in;
      image-rendering: pixelated;
      width: 1.25in;
    }
    .label h2 {
      font-size: 18px;
      line-height: 1.08;
      margin: 0 0 0.05in;
    }
    .label p {
      font-size: 11px;
      line-height: 1.25;
      margin: 0.03in 0;
      overflow-wrap: anywhere;
    }
    .pages {
      display: block;
    }
    .page {
      align-content: center;
      background: #ffffff;
      border: 1px solid #111827;
      box-sizing: border-box;
      display: grid;
      justify-items: center;
      min-height: 10in;
      padding: 0.5in;
      page-break-after: always;
      text-align: center;
    }
    .page img {
      height: 4in;
      image-rendering: pixelated;
      width: 4in;
    }
    .page h2 {
      font-size: 44px;
      margin: 0 0 0.18in;
    }
    .page p {
      font-size: 17px;
      line-height: 1.35;
      margin: 0.05in 0;
      overflow-wrap: anywhere;
    }
    @page {
      margin: 0.25in;
      size: letter portrait;
    }
    @media print {
      body {
        background: #ffffff;
      }
      .toolbar {
        display: none;
      }
      .sheet {
        padding: 0;
        width: auto;
      }
      .labels {
        gap: 0.12in;
      }
      .label {
        min-height: 1.72in;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>${escapeHtml(title)}</h1>
    <div>
      <button type="button" id="copy-payloads">Copy Payloads</button>
      <a download="camp-picture-qr-manifest.csv" href="camp-picture-qr-manifest.csv">Export CSV</a>
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <main class="sheet ${layoutClass}">
    ${cards}
  </main>
  <script>
    const payloadCsv = ${JSON.stringify(csv)};
    document.getElementById('copy-payloads').addEventListener('click', async () => {
      await navigator.clipboard.writeText(payloadCsv);
    });
  </script>
</body>
</html>
`;

  await fs.writeFile(path.join(targetDir, fileName), html);
}

function labelMarkup(item, mode) {
  const dates = [item.startDate, item.endDate].filter(Boolean).join(' to ');
  const details = [
    dates,
    item.day ? `Day: ${item.day}` : null,
    item.group ? `Group: ${item.group}` : null,
    item.room ? `Room: ${item.room}` : null,
  ].filter(Boolean);
  const tag = mode === 'pages' ? 'section' : 'article';
  const className = mode === 'pages' ? 'page' : 'label';

  return `    <${tag} class="${className}">
      <img src="${escapeAttribute(item.pngFile)}" alt="QR for ${escapeAttribute(item.label)}">
      <div>
        <h2>${escapeHtml(item.label)}</h2>
        ${details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join('\n        ')}
        <p>${escapeHtml(item.payload)}</p>
      </div>
    </${tag}>`;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function handleFatalError(error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function usage() {
  return `Usage: pnpm camp:picture-qrs [options]

Generate printable camp picture QR codes, manifests, and print HTML.

Options:
  --year <year>        Camp year. Defaults to ${DEFAULT_YEAR}.
  --out-dir <path>     Output directory. Defaults to output/camp-picture-qrs/<year>.
  --payloads <path>    JSON array, or object with an items array, for custom QR payloads.
  --copies <count>     Copies of each QR in print HTML. Defaults to ${DEFAULT_COPIES}; max ${MAX_COPIES}.
  --dry-run           Validate inputs and print planned QR payloads without writing files.
  --help              Show this help.

Custom payload items may include week, startDate/start_date, endDate/end_date, label, group, room,
targetUrl/target_url, payload, and fileBase/file_base. fileBase must be a plain file basename
without an extension. Non-2026 schedules require --payloads.`;
}
