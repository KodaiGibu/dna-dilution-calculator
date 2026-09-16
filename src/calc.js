/**
 * DNA希釈計算ツール v2.2 — 計算コア（Web移植版）
 * 移植元: dna_dilution_calculator.py (tkinter版 v2.2)
 *
 * Python 版と同一の計算結果・同一の表示文字列を返すことを目的とする。
 * 依存なしの ES Module。ブラウザ / Node の両方から import 可能。
 */

// ══ 定数（Python版 冒頭の定数定義と同一）══
export const APP_TITLE = 'DNA希釈計算ツール（MiSeq用）v2.2';
export const DEFAULT_TARGET_NM = 4.0;
export const DEFAULT_TARGET_NGUL = 2.0;
export const DEFAULT_SAMPLE_UL = 10.0;
export const DEFAULT_MW_PER_BP = 660.0;
export const DEFAULT_BP_LENGTH = 600;
export const STRIP_SIZE = 8;
export const STRIP_COLORS = ['#e3f2fd', '#fff9c4'];
export const STRIP_HTML_COLORS = ['#e3f2fd', '#fff9c4'];
export const WARN_COLOR = '#ffd6d6';

// Python版 _parse_nm / _parse_ng の skip_headers
const SKIP_HEADERS = new Set(['サンプルid', 'sampleid', 'sample_id', 'sample', 'id']);

// ══ Python 互換ユーティリティ ══

/**
 * Python の round(x, n) と同じ「偶数丸め（banker's rounding）」。
 * JS の Math.round は常に切り上げのため、そのままでは Python と結果が食い違う。
 */
export function pyRound(value, digits = 0) {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, digits);
  // 2進浮動小数の表現誤差を吸収してから .5 判定を行う
  const scaled = parseFloat((value * factor).toPrecision(15));
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r;
  if (Math.abs(diff - 0.5) < 1e-9) {
    r = floor % 2 === 0 ? floor : floor + 1;
  } else {
    r = Math.round(scaled);
  }
  return r / factor;
}

/**
 * Python の str(値) 相当。float は必ず小数点を伴う（312.0 → "312.0"）。
 * Treeview / CSV / HTML すべてで Python 版と同じ文字列を出すために使用する。
 */
export function pyStr(v) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && Object.is(v, Math.trunc(v))) {
    // 整数値の float は "600.0" 形式、int（bp変換後など）は呼び出し側で int 化済み
    return Number.isSafeInteger(v) ? `${v}.0` : String(v);
  }
  return String(v);
}

/** Python: float(s) 相当。空白除去・失敗時は例外 */
export function pyFloat(s, label = '数値') {
  const t = String(s).trim();
  if (t === '') throw new Error(`${label}が空です。`);
  const v = Number(t);
  if (!Number.isFinite(v)) throw new Error(`${label}を数値に変換できません（入力値: ${t}）。`);
  return v;
}

/** Python: `int(v) if v == int(v) else v` の表示整形（bp 用） */
export function bpDisplay(bp) {
  return bp === Math.trunc(bp) ? String(Math.trunc(bp)) : String(bp);
}

// ══ 計算本体 ══

/**
 * nM モード 1 サンプル分（Python版 _calc_nm のループ内と同一ロジック）
 * target_pg = mw * bp * target_nM / 1000
 * qubit_pg <= target_pg → 濃度不足
 * water = sample_ul * (qubit_pg / target_pg - 1)
 */
export function calcNmRecord(sid, bp, qubitNg, targetNm, sampleUl, mw) {
  const targetPg = (mw * bp * targetNm) / 1000.0;
  const qubitPg = qubitNg * 1000.0;
  if (qubitPg <= targetPg) {
    return {
      sample_id: sid, bp, qubit: qubitNg, target_pg: pyRound(targetPg, 2),
      water: '濃度不足', half: '―', warn: true,
    };
  }
  const water = sampleUl * (qubitPg / targetPg - 1);
  return {
    sample_id: sid, bp, qubit: qubitNg, target_pg: pyRound(targetPg, 2),
    water: pyRound(water, 1), half: pyRound(water / 2.0, 1), warn: false,
  };
}

/** ng/µL モード 1 サンプル分（Python版 _calc_ng のループ内と同一ロジック） */
export function calcNgRecord(sid, qubit, targetNg, sampleUl) {
  if (qubit <= targetNg) {
    return { sample_id: sid, qubit, target_ng: targetNg, water: '濃度不足', half: '―', warn: true };
  }
  const water = sampleUl * (qubit / targetNg - 1);
  return {
    sample_id: sid, qubit, target_ng: targetNg,
    water: pyRound(water, 1), half: pyRound(water / 2.0, 1), warn: false,
  };
}

/** Python版 _strip_tag と同一 */
export function stripTag(rowIdx, isWarn, useStrip) {
  if (isWarn) return 'warn';
  if (useStrip) return `strip${Math.floor(rowIdx / STRIP_SIZE) % 2}`;
  return 'normal';
}

/** Python版 _fmt_val と同一（strip_group は 1 始まり） */
export function fmtVal(rec, key, rowIdx = 0) {
  if (key === 'strip_group') return String(Math.floor(rowIdx / STRIP_SIZE) + 1);
  const v = rec[key];
  if (v === undefined || v === null) return '';
  if (key === 'bp' && typeof v === 'number' && v === Math.trunc(v)) return String(Math.trunc(v));
  return pyStr(v);
}

// ══ 入力パース ══

function isHeader(sid) {
  return SKIP_HEADERS.has(String(sid).toLowerCase().split(' ').join('').split('_').join(''));
}

function nonEmptyLines(text) {
  return String(text).trim().split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
}
function allLines(text) {
  return String(text).trim().split(/\r?\n/).map((l) => l.trim());
}

/**
 * nM 個別入力タブ（Python版 _parse_nm の tab_idx == 0 分岐）
 * @returns {[string, number, number][]} [sid, bp, qubit]
 */
export function parseNmSeparate(idsText, bpsText, concText, commonBp) {
  const ids = nonEmptyLines(idsText);
  const bpsRaw = allLines(bpsText);
  const conc = nonEmptyLines(concText);
  if (!ids.length) throw new Error('サンプルIDを入力してください。');
  if (!conc.length) throw new Error('Qubit濃度を入力してください。');
  if (ids.length !== conc.length) {
    throw new Error(`サンプルID (${ids.length}行) と Qubit濃度 (${conc.length}行) の行数が不一致。`);
  }
  return ids.map((sid, i) => {
    let bpVal = commonBp;
    if (!commonBp) {
      if (i >= bpsRaw.length || !bpsRaw[i]) throw new Error(`塩基長が不足（行${i + 1}: ${sid}）`);
      bpVal = pyFloat(bpsRaw[i], `行${i + 1}の塩基長`);
    }
    return [sid, bpVal, pyFloat(conc[i], `行${i + 1}のQubit濃度`)];
  });
}

/** nM 一括入力タブ（Python版 _parse_nm の else 分岐） */
export function parseNmBulk(bulkText, commonBp) {
  const lines = nonEmptyLines(bulkText);
  if (!lines.length) throw new Error('一括入力にデータを貼り付けてください。');
  const samples = [];
  lines.forEach((line, i) => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length < 3) {
      if (i === 0) return;
      throw new Error(`行${i + 1}: 3列必要です。`);
    }
    const sid = parts[0].trim();
    if (isHeader(sid)) return;
    const bpVal = commonBp ? commonBp : pyFloat(parts[1], `行${i + 1}の塩基長`);
    samples.push([sid, bpVal, pyFloat(parts[2], `行${i + 1}のQubit濃度`)]);
  });
  if (!samples.length) throw new Error('有効なサンプルデータがありません。');
  return samples;
}

/** ng 個別入力タブ（Python版 _parse_ng の tab_idx == 0 分岐） */
export function parseNgSeparate(idsText, concText) {
  const ids = nonEmptyLines(idsText);
  const conc = nonEmptyLines(concText);
  if (!ids.length) throw new Error('サンプルIDを入力してください。');
  if (!conc.length) throw new Error('Qubit濃度を入力してください。');
  if (ids.length !== conc.length) {
    throw new Error(`サンプルID (${ids.length}行) と Qubit濃度 (${conc.length}行) の行数が不一致。`);
  }
  return ids.map((sid, i) => [sid, pyFloat(conc[i], `行${i + 1}のQubit濃度`)]);
}

/** ng 一括入力タブ（Python版 _parse_ng の else 分岐） */
export function parseNgBulk(bulkText) {
  const lines = nonEmptyLines(bulkText);
  if (!lines.length) throw new Error('一括入力にデータを貼り付けてください。');
  const samples = [];
  lines.forEach((line, i) => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length < 2) {
      if (i === 0) return;
      throw new Error(`行${i + 1}: 2列必要です。`);
    }
    const sid = parts[0].trim();
    if (isHeader(sid)) return;
    samples.push([sid, pyFloat(parts[1], `行${i + 1}のQubit濃度`)]);
  });
  if (!samples.length) throw new Error('有効なサンプルデータがありません。');
  return samples;
}

// ══ 日時（Python: DATETIME_FMT = "%Y-%m-%d %H:%M"）══
const p2 = (n) => String(n).padStart(2, '0');
export function nowStr(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
/** Python: datetime.now().strftime('%Y%m%d_%H%M') */
export function fileStamp(d = new Date()) {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
}
