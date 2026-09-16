/**
 * DNA希釈計算ツール（MiSeq用） — 計算コア
 * 仕様書 v2.2 §6 に準拠
 *
 * 依存なしの ES Module。ブラウザ / Node の両方から import 可能。
 */

// ===== 定数（仕様書 §4） =====
export const DEFAULTS = {
  TARGET_NM: 4.0,
  TARGET_NGUL: 2.0,
  SAMPLE_UL: 10.0,
  MW_PER_BP: 660.0,
  BP_LENGTH: 600,
};

export const STRIP_SIZE = 8;
export const STRIP_COLORS = ['#e3f2fd', '#fff9c4'];
export const WARN_COLOR = '#ffd6d6';
export const APP_TITLE = 'DNA希釈計算ツール（MiSeq用） Web版';

export const DEFAULT_PRESETS = [
  { name: '16S V4 + adapter', bp: 452 },
  { name: 'ITS region', bp: 600 },
  { name: '18S V9', bp: 380 },
];

// ===== 丸め（Python の round() と同じ銀行丸め: round-half-to-even） =====
export function roundHalfEven(value, digits = 0) {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, digits);
  const scaled = value * factor;
  // 浮動小数の表現誤差を吸収してから判定する（Python の round と同等の挙動に近づける）
  const fixed = parseFloat(scaled.toPrecision(15));
  const floor = Math.floor(fixed);
  const diff = fixed - floor;
  let rounded;
  if (Math.abs(diff - 0.5) < Number.EPSILON * 8) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(fixed);
  }
  return rounded / factor;
}

// ===== §6.1 モル濃度希釈 (nM) =====

/** ターゲット濃度 (pg/µL) = MW_per_bp × bp × target_nM ÷ 1000 */
export function targetPgPerUl(mwPerBp, bp, targetNm) {
  return (mwPerBp * bp * targetNm) / 1000.0;
}

/**
 * nM モードの 1 サンプル計算
 * @returns {{sample_id:string,bp:number,qubit:number,target_pg:number,
 *            water:number|string,half:number|string,warn:boolean}}
 */
export function calcNm({ sampleId, bp, qubit, targetNm, sampleUl, mwPerBp }) {
  const tpg = targetPgPerUl(mwPerBp, bp, targetNm);
  const qubitPg = qubit * 1000.0;
  const rec = {
    sample_id: sampleId,
    bp,
    qubit,
    target_pg: roundHalfEven(tpg, 2),
    water: '濃度不足',
    half: '―',
    warn: true,
  };
  if (qubitPg > tpg) {
    const waterRaw = sampleUl * (qubitPg / tpg - 1);
    rec.water = roundHalfEven(waterRaw, 1);
    rec.half = roundHalfEven(waterRaw / 2.0, 1); // 生値から独立して丸める
    rec.warn = false;
  }
  return rec;
}

// ===== §6.2 濃度希釈 (ng/µL) =====
export function calcNg({ sampleId, qubit, targetNg, sampleUl }) {
  const rec = {
    sample_id: sampleId,
    qubit,
    target_ng: targetNg,
    water: '濃度不足',
    half: '―',
    warn: true,
  };
  if (qubit > targetNg) {
    const waterRaw = sampleUl * (qubit / targetNg - 1);
    rec.water = roundHalfEven(waterRaw, 1);
    rec.half = roundHalfEven(waterRaw / 2.0, 1);
    rec.warn = false;
  }
  return rec;
}

// ===== §8.4 8連チューブ色分け =====
export function stripTag(rowIdx, isWarn, useStrip) {
  if (isWarn) return 'warn';
  if (useStrip) return `strip${Math.floor(rowIdx / STRIP_SIZE) % 2}`;
  return 'normal';
}

export function stripGroup(rowIdx) {
  return Math.floor(rowIdx / STRIP_SIZE) + 1;
}

export function rowColor(rowIdx, isWarn, useStrip) {
  if (isWarn) return WARN_COLOR;
  if (useStrip) return STRIP_COLORS[Math.floor(rowIdx / STRIP_SIZE) % 2];
  return rowIdx % 2 === 1 ? '#f9f9f9' : '';
}

// ===== 入力パース（§8.1.2 / §8.2） =====
const HEADER_KEYS = new Set(['サンプルid', 'sampleid', 'sample_id', 'sample', 'id']);

function normalizeHeader(token) {
  return String(token).toLowerCase().replace(/[\s]/g, '').replace(/_/g, '');
}

export function isHeaderRow(firstCell) {
  const n = normalizeHeader(firstCell);
  for (const key of HEADER_KEYS) {
    if (normalizeHeader(key) === n) return true;
  }
  return false;
}

export function splitLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitCells(line) {
  return line.split(/\t|,/).map((s) => s.trim());
}

/**
 * 個別入力（3列 Text）のパース。commonBp が null の場合は bp 列必須。
 * @throws {Error} バリデーションエラー
 */
export function parseSeparateNm(idsText, bpsText, qubitsText, commonBp) {
  const ids = splitLines(idsText);
  const bps = splitLines(bpsText);
  const qs = splitLines(qubitsText);
  if (ids.length === 0) throw new Error('サンプルIDを入力してください。');
  if (qs.length === 0) throw new Error('Qubit濃度を入力してください。');
  if (ids.length !== qs.length) {
    throw new Error(`サンプルID (${ids.length}行) と Qubit濃度 (${qs.length}行) の行数が不一致。`);
  }
  return ids.map((id, i) => {
    let bp;
    if (commonBp != null) {
      bp = bps.length > i && bps[i] !== '' ? toPositive(bps[i], `行${i + 1}: 塩基長`) : commonBp;
    } else {
      if (bps.length <= i || bps[i] === '') throw new Error(`塩基長が不足（行${i + 1}: ${id}）`);
      bp = toPositive(bps[i], `行${i + 1}: 塩基長`);
    }
    return { sampleId: id, bp, qubit: toPositive(qs[i], `行${i + 1}: Qubit濃度`) };
  });
}

/** 一括入力（ID \t bp \t qubit）のパース */
export function parseBulkNm(text, commonBp) {
  const lines = splitLines(text);
  if (lines.length === 0) throw new Error('サンプルIDを入力してください。');
  const rows = [];
  lines.forEach((line, i) => {
    const cells = splitCells(line);
    if (i === 0 && isHeaderRow(cells[0])) return;
    if (cells.length >= 3) {
      rows.push({
        sampleId: cells[0],
        bp: toPositive(cells[1], `行${i + 1}: 塩基長`),
        qubit: toPositive(cells[2], `行${i + 1}: Qubit濃度`),
      });
    } else if (cells.length === 2 && commonBp != null) {
      rows.push({
        sampleId: cells[0],
        bp: commonBp,
        qubit: toPositive(cells[1], `行${i + 1}: Qubit濃度`),
      });
    } else {
      throw new Error(`行${i + 1}: 3列必要です。`);
    }
  });
  if (rows.length === 0) throw new Error('有効なデータ行がありません。');
  return rows;
}

export function parseSeparateNg(idsText, qubitsText) {
  const ids = splitLines(idsText);
  const qs = splitLines(qubitsText);
  if (ids.length === 0) throw new Error('サンプルIDを入力してください。');
  if (qs.length === 0) throw new Error('Qubit濃度を入力してください。');
  if (ids.length !== qs.length) {
    throw new Error(`サンプルID (${ids.length}行) と Qubit濃度 (${qs.length}行) の行数が不一致。`);
  }
  return ids.map((id, i) => ({
    sampleId: id,
    qubit: toPositive(qs[i], `行${i + 1}: Qubit濃度`),
  }));
}

export function parseBulkNg(text) {
  const lines = splitLines(text);
  if (lines.length === 0) throw new Error('サンプルIDを入力してください。');
  const rows = [];
  lines.forEach((line, i) => {
    const cells = splitCells(line);
    if (i === 0 && isHeaderRow(cells[0])) return;
    if (cells.length < 2) throw new Error(`行${i + 1}: 2列必要です。`);
    rows.push({ sampleId: cells[0], qubit: toPositive(cells[1], `行${i + 1}: Qubit濃度`) });
  });
  if (rows.length === 0) throw new Error('有効なデータ行がありません。');
  return rows;
}

export function toPositive(value, label) {
  const v = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${label} は正の数値で入力してください（入力値: ${value}）。`);
  return v;
}

// ===== 値の整形（§8.6） =====
export function fmtVal(rec, key, rowIdx) {
  switch (key) {
    case 'sample_id':
      return rec.sample_id;
    case 'bp':
      return Number.isInteger(rec.bp) ? String(rec.bp) : String(rec.bp);
    case 'qubit':
      return String(rec.qubit);
    case 'target_pg':
      return rec.target_pg.toFixed(2);
    case 'target_ng':
      return String(rec.target_ng);
    case 'water':
      return typeof rec.water === 'number' ? rec.water.toFixed(1) : rec.water;
    case 'half':
      return typeof rec.half === 'number' ? rec.half.toFixed(1) : rec.half;
    case 'strip_group':
      return String(stripGroup(rowIdx));
    default:
      return '';
  }
}

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
