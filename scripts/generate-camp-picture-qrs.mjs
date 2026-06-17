#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const DEFAULT_WIDTH = 450;
const DEFAULT_MARGIN = 2;
const DEFAULT_COPIES = 1;

const args = parseArgs(process.argv.slice(2));
const year = Number(args.year ?? new Date().getFullYear());
const outDir = path.resolve(String(args['out-dir'] ?? `output/camp-picture-qrs/${year}`));
const payloadsFile = args.payloads ? path.resolve(String(args.payloads)) : null;
const copies = Number(args.copies ?? DEFAULT_COPIES);

if (!Number.isInteger(year) || year < 2000) {
  throw new Error(`Invalid --year: ${args.year}`);
}

if (!Number.isInteger(copies) || copies < 1) {
  throw new Error(`Invalid --copies: ${args.copies}`);
}

const items = payloadsFile
  ? normalizePayloads(JSON.parse(await fs.readFile(payloadsFile, 'utf8')))
  : defaultCampWeeks(year);

await fs.mkdir(outDir, { recursive: true });

const generated = [];

for (const item of items) {
  const basename = item.fileBase ?? `Week${item.week}_QRCode`;
  const pngFile = `${basename}.png`;
  const svgFile = `${basename}.svg`;
  const pngPath = path.join(outDir, pngFile);
  const svgPath = path.join(outDir, svgFile);
  const payload = item.payload ?? item.targetUrl ?? safeTextPayload(item);

  await QRCode.toFile(pngPath, payload, {
    type: 'png',
    width: DEFAULT_WIDTH,
    margin: DEFAULT_MARGIN,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  await QRCode.toFile(svgPath, payload, {
    type: 'svg',
    margin: DEFAULT_MARGIN,
    errorCorrectionLevel: 'M',
  });

  const decoded = await decodeQrPng(pngPath);
  if (decoded !== payload) {
    throw new Error(`QR verification failed for ${pngFile}: decoded "${decoded}"`);
  }

  generated.push({
    ...item,
    payload,
    pngFile,
    svgFile,
    pngPath,
    svgPath,
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
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    i += 1;
  }

  return parsed;
}

function normalizePayloads(raw) {
  const payloads = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(payloads)) {
    throw new Error('Payload file must be an array or an object with an items array.');
  }

  return payloads.map((item, index) => {
    const week = Number(item.week ?? index + 1);
    if (!Number.isInteger(week) || week < 1) {
      throw new Error(`Invalid week at payload index ${index}`);
    }

    return {
      week,
      day: item.day ?? null,
      startDate: item.startDate ?? item.start_date ?? null,
      endDate: item.endDate ?? item.end_date ?? null,
      label: item.label ?? `Week ${week}`,
      group: item.group ?? null,
      room: item.room ?? null,
      targetUrl: item.targetUrl ?? item.target_url ?? null,
      payload: item.payload ?? item.targetUrl ?? item.target_url ?? null,
      fileBase: item.fileBase ?? item.file_base ?? `Week${week}_QRCode`,
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

  const start = firstMondayOnOrAfter(new Date(Date.UTC(campYear, 5, 29)));
  return Array.from({ length: 10 }, (_, index) => {
    const monday = addDays(start, index * 7);
    return week(index + 1, isoDate(monday), isoDate(addDays(monday, 4)));
  });
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

function safeTextPayload(item) {
  const pieces = [
    'zebra-camp-picture',
    `year=${year}`,
    `week=${item.week}`,
    item.day ? `day=${item.day}` : null,
    item.startDate ? `start=${item.startDate}` : null,
    item.endDate ? `end=${item.endDate}` : null,
    item.group ? `group=${item.group}` : null,
    item.room ? `room=${item.room}` : null,
  ].filter(Boolean);

  return pieces.join(';');
}

async function decodeQrPng(filePath) {
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

function firstMondayOnOrAfter(date) {
  const day = date.getUTCDay();
  const offset = day === 1 ? 0 : (8 - day) % 7;
  return addDays(date, offset);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
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
