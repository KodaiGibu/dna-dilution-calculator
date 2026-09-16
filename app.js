/**
 * DNA希釈計算ツール（MiSeq用）Web版 — UI レイヤー
 * 仕様書 v2.2 §7〜§9 の Web 移植
 */
import {
  DEFAULTS, DEFAULT_PRESETS, STRIP_COLORS, WARN_COLOR,
  calcNm, calcNg, stripTag, rowColor, fmtVal,
  parseSeparateNm, parseBulkNm, parseSeparateNg, parseBulkNg,
  toPositive, timestamp, fileStamp,
} from './calc.js';

const $ = (id) => document.getElementById(id);
const PRESET_KEY = 'dna_dilution_presets';
const COL_KEY = 'dna_dilution_col_defaults';

const state = {
  mode: 'nm',
  inputMode: { nm: 'separate', ng: 'separate' },
  results: { nm: [], ng: [] },
  params: { nm: null, ng: null },
  presets: loadPresets(),
};

// ===== 永続化（localStorage） =====
function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return [...DEFAULT_PRESETS];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [...DEFAULT_PRESETS];
  } catch { return [...DEFAULT_PRESETS]; }
}
function savePresets() {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(state.presets)); } catch { /* noop */ }
}
function loadColDefaults(mode) {
  try {
    const obj = JSON.parse(localStorage.getItem(COL_KEY) || '{}');
    return Array.isArray(obj[mode]) ? obj[mode] : null;
  } catch { return null; }
}
function saveColDefaults(mode, keys) {
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem(COL_KEY) || '{}'); } catch { /* noop */ }
  obj[mode] = keys;
  try { localStorage.setItem(COL_KEY, JSON.stringify(obj)); } catch { /* noop */ }
}

// ===== 汎用 UI =====
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
function setStatus(mode, text, isError = false) {
  const el = $(`${mode}-status`);
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ===== モード切替 =====
document.querySelectorAll('.tabs[role="tablist"] .tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('.tabs[role="tablist"] .tab').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('pane-nm').classList.toggle('hidden', state.mode !== 'nm');
    $('pane-ng').classList.toggle('hidden', state.mode !== 'ng');
  });
});

// 個別 / 一括入力タブ
document.querySelectorAll('[data-input-tabs]').forEach((group) => {
  const mode = group.dataset.inputTabs;
  group.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.inputMode[mode] = btn.dataset.input;
      group.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      const pane = $(`pane-${mode}`);
      pane.querySelectorAll('[data-input-pane]').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.inputPane !== btn.dataset.input);
      });
    });
  });
});

// ===== プリセット =====
function refreshPresetCombo() {
  const sel = $('nm-preset');
  const current = sel.value;
  sel.innerHTML = '<option value="">（選択）</option>';
  state.presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${p.name}  (${p.bp} bp)`;
    sel.appendChild(opt);
  });
  if (current && state.presets[Number(current)]) sel.value = current;
}
$('nm-preset').addEventListener('change', (e) => {
  const p = state.presets[Number(e.target.value)];
  if (!p) return;
  $('nm-bp').value = p.bp;
  $('nm-use-common').checked = true;
});

const dlgPreset = $('dlg-preset');
$('nm-preset-mgr').addEventListener('click', () => { refreshPresetList(); dlgPreset.showModal(); });
$('preset-close').addEventListener('click', () => dlgPreset.close());

function refreshPresetList() {
  const list = $('preset-list');
  list.innerHTML = '';
  state.presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${p.name}  (${p.bp} bp)`;
    list.appendChild(opt);
  });
  $('preset-msg').textContent = '';
}
$('preset-list').addEventListener('change', (e) => {
  const p = state.presets[Number(e.target.value)];
  if (!p) return;
  $('preset-name').value = p.name;
  $('preset-bp').value = p.bp;
});
function validatePreset() {
  const name = $('preset-name').value.trim();
  const bp = Number($('preset-bp').value);
  if (!name) { $('preset-msg').textContent = '遺伝子名を入力してください。'; return null; }
  if (!Number.isFinite(bp) || bp <= 0) { $('preset-msg').textContent = '塩基長は正の数値で入力してください。'; return null; }
  return { name, bp };
}
function commitPresets() { savePresets(); refreshPresetList(); refreshPresetCombo(); }
$('preset-add').addEventListener('click', () => {
  const p = validatePreset(); if (!p) return;
  if (state.presets.some((x) => x.name === p.name)) { $('preset-msg').textContent = '同名のプリセットが既に存在します。'; return; }
  state.presets.push(p); commitPresets(); toast('プリセットを追加しました');
});
$('preset-update').addEventListener('click', () => {
  const idx = Number($('preset-list').value);
  if (!state.presets[idx]) { $('preset-msg').textContent = '一覧から項目を選択してください。'; return; }
  const p = validatePreset(); if (!p) return;
  state.presets[idx] = p; commitPresets(); toast('プリセットを更新しました');
});
$('preset-delete').addEventListener('click', () => {
  const idx = Number($('preset-list').value);
  if (!state.presets[idx]) { $('preset-msg').textContent = '一覧から項目を選択してください。'; return; }
  if (!confirm(`「${state.presets[idx].name}」を削除しますか？`)) return;
  state.presets.splice(idx, 1); commitPresets(); toast('プリセットを削除しました');
});
$('preset-reset').addEventListener('click', () => {
  if (!confirm('プリセットを初期値に戻しますか？')) return;
  state.presets = [...DEFAULT_PRESETS]; commitPresets(); toast('初期値に戻しました');
});

// ===== 計算（nM） =====
function getParamsNm() {
  return {
    targetNm: toPositive($('nm-target').value, 'ターゲット濃度 (nM)'),
    sampleUl: toPositive($('nm-sample').value, 'サンプル量 (µL)'),
    mwPerBp: toPositive($('nm-mw').value, 'MW per bp (g)'),
    commonBp: $('nm-use-common').checked ? toPositive($('nm-bp').value, '塩基長 (bp)') : null,
  };
}
$('nm-calc').addEventListener('click', () => {
  try {
    const p = getParamsNm();
    const rows = state.inputMode.nm === 'separate'
      ? parseSeparateNm($('nm-ids').value, $('nm-bps').value, $('nm-qubits').value, p.commonBp)
      : parseBulkNm($('nm-bulk').value, p.commonBp);
    state.results.nm = rows.map((r) => calcNm({ ...r, targetNm: p.targetNm, sampleUl: p.sampleUl, mwPerBp: p.mwPerBp }));
    state.params.nm = p;
    renderTable('nm');
    const warn = state.results.nm.filter((r) => r.warn).length;
    setStatus('nm', `[nM] 計算完了: ${state.results.nm.length}件` +
      (warn ? `（濃度不足 ${warn}件）` : '') +
      ` | ${p.targetNm} nM | ${p.sampleUl} µL | MW/bp ${p.mwPerBp}` +
      (p.commonBp != null ? ` | 共通 ${p.commonBp} bp` : ' | 個別bp'));
  } catch (e) { setStatus('nm', `エラー: ${e.message}`, true); }
});
$('nm-clear').addEventListener('click', () => {
  ['nm-ids', 'nm-bps', 'nm-qubits', 'nm-bulk'].forEach((id) => { $(id).value = ''; });
  state.results.nm = []; renderTable('nm'); setStatus('nm', '未計算');
});
$('nm-sample-data').addEventListener('click', () => {
  $('nm-ids').value = ['Ishigaki_soil_1_16S', 'Ishigaki_soil_2_16S', 'Ishigaki_soil_3_16S',
    'Ishigaki_soil_4_16S', 'Ishigaki_soil_5_16S'].join('\n');
  $('nm-bps').value = '';
  $('nm-qubits').value = ['51.0', '52.8', '42.2', '47.2', '43.6'].join('\n');
  $('nm-bulk').value = 'Ishigaki_soil_1_16S\t600\t51.0\nIshigaki_soil_2_16S\t600\t52.8';
  toast('仕様書 §12.1 のテストデータを入力しました');
});

// ===== 計算（ng/µL） =====
$('ng-calc').addEventListener('click', () => {
  try {
    const targetNg = toPositive($('ng-target').value, 'ターゲット濃度 (ng/µL)');
    const sampleUl = toPositive($('ng-sample').value, 'サンプル量 (µL)');
    const rows = state.inputMode.ng === 'separate'
      ? parseSeparateNg($('ng-ids').value, $('ng-qubits').value)
      : parseBulkNg($('ng-bulk').value);
    state.results.ng = rows.map((r) => calcNg({ ...r, targetNg, sampleUl }));
    state.params.ng = { targetNg, sampleUl };
    renderTable('ng');
    const warn = state.results.ng.filter((r) => r.warn).length;
    setStatus('ng', `[ng/µL] 計算完了: ${state.results.ng.length}件` +
      (warn ? `（濃度不足 ${warn}件）` : '') + ` | ${targetNg} ng/µL | ${sampleUl} µL`);
  } catch (e) { setStatus('ng', `エラー: ${e.message}`, true); }
});
$('ng-clear').addEventListener('click', () => {
  ['ng-ids', 'ng-qubits', 'ng-bulk'].forEach((id) => { $(id).value = ''; });
  state.results.ng = []; renderTable('ng'); setStatus('ng', '未計算');
});
$('ng-sample-data').addEventListener('click', () => {
  $('ng-ids').value = 'Sample_A\nSample_B\nSample_C';
  $('ng-qubits').value = '10.0\n5.0\n1.5';
  $('ng-bulk').value = 'Sample_A\t10.0\nSample_B\t5.0\nSample_C\t1.5';
  toast('仕様書 §12.2 のテストデータを入力しました');
});

['nm-strip', 'ng-strip'].forEach((id) => {
  $(id).addEventListener('change', () => renderTable(id.startsWith('nm') ? 'nm' : 'ng'));
});

// ===== 列定義（§8.5） =====
function buildExportColumns(mode) {
  const sampleUl = mode === 'nm' ? (state.params.nm?.sampleUl ?? DEFAULTS.SAMPLE_UL)
    : (state.params.ng?.sampleUl ?? DEFAULTS.SAMPLE_UL);
  const half = `半量(${(sampleUl / 2).toFixed(1)}µL)`;
  const cols = mode === 'nm'
    ? [['sample_id', 'サンプルID'], ['bp', '塩基長(bp)'], ['qubit', 'Qubit(ng/µL)'],
       ['target_pg', 'ターゲット(pg/µL)'], ['water', '希釈水量(µL)'], ['half', half]]
    : [['sample_id', 'サンプルID'], ['qubit', 'Qubit(ng/µL)'],
       ['target_ng', 'ターゲット(ng/µL)'], ['water', '希釈水量(µL)'], ['half', half]];
  if ($(`${mode}-strip`).checked) cols.push(['strip_group', '8連グループ']);
  return cols;
}

// ===== 結果テーブル描画 =====
function renderTable(mode) {
  const table = $(`${mode}-table`);
  const results = state.results[mode];
  table.innerHTML = '';
  if (!results.length) return;
  const cols = buildExportColumns(mode);
  const useStrip = $(`${mode}-strip`).checked;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  cols.forEach(([, disp]) => { const th = document.createElement('th'); th.textContent = disp; trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);

  const tbody = document.createElement('tbody');
  results.forEach((rec, i) => {
    const tr = document.createElement('tr');
    tr.className = stripTag(i, rec.warn, useStrip);
    cols.forEach(([key]) => {
      const td = document.createElement('td');
      td.textContent = fmtVal(rec, key, i);
      if (key === 'sample_id') td.classList.add('left');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

// ===== 列選択ダイアログ =====
const dlgCols = $('dlg-columns');
function askColumns(mode) {
  return new Promise((resolve) => {
    const cols = buildExportColumns(mode);
    const defaults = loadColDefaults(mode);
    const box = $('column-checks');
    box.innerHTML = '';
    cols.forEach(([key, disp]) => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = key;
      cb.checked = defaults ? defaults.includes(key) : true;
      label.append(cb, document.createTextNode(disp));
      box.appendChild(label);
    });
    const boxes = () => [...box.querySelectorAll('input')];
    const selected = () => boxes().filter((c) => c.checked).map((c) => c.value);

    const onAllOn = () => boxes().forEach((c) => { c.checked = true; });
    const onAllOff = () => boxes().forEach((c) => { c.checked = false; });
    const onSaveDefault = () => {
      if (!selected().length) { toast('1列以上選択してください'); return; }
      saveColDefaults(mode, selected()); toast('現在の選択をデフォルトに設定しました');
    };
    const onRestore = () => {
      const d = loadColDefaults(mode);
      boxes().forEach((c) => { c.checked = d ? d.includes(c.value) : true; });
    };
    const finish = (value) => {
      $('col-all-on').removeEventListener('click', onAllOn);
      $('col-all-off').removeEventListener('click', onAllOff);
      $('col-save-default').removeEventListener('click', onSaveDefault);
      $('col-restore-default').removeEventListener('click', onRestore);
      $('col-ok').removeEventListener('click', onOk);
      $('col-cancel').removeEventListener('click', onCancel);
      dlgCols.close();
      resolve(value);
    };
    const onOk = () => {
      const keys = selected();
      if (!keys.length) { toast('1列以上選択してください'); return; }
      finish(cols.filter(([k]) => keys.includes(k)));
    };
    const onCancel = () => finish(null);

    $('col-all-on').addEventListener('click', onAllOn);
    $('col-all-off').addEventListener('click', onAllOff);
    $('col-save-default').addEventListener('click', onSaveDefault);
    $('col-restore-default').addEventListener('click', onRestore);
    $('col-ok').addEventListener('click', onOk);
    $('col-cancel').addEventListener('click', onCancel);
    dlgCols.showModal();
  });
}

// ===== パラメータ文字列 =====
function paramLine(mode) {
  if (mode === 'nm') {
    const p = state.params.nm;
    return `ターゲット: ${p.targetNm} nM / サンプル量: ${p.sampleUl} µL / MW per bp: ${p.mwPerBp} g` +
      (p.commonBp != null ? ` / 共通塩基長: ${p.commonBp} bp` : ' / 塩基長: 個別指定');
  }
  const p = state.params.ng;
  return `ターゲット: ${p.targetNg} ng/µL / サンプル量: ${p.sampleUl} µL`;
}
const MODE_LABEL = { nm: 'モル濃度希釈 (nM)', ng: '濃度希釈 (ng/µL)' };

function ensureResults(mode) {
  if (!state.results[mode].length) { toast('先に計算を実行してください'); return false; }
  return true;
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== CSV 出力（§8.6, UTF-8 BOM 付き） =====
async function exportCsv(mode) {
  if (!ensureResults(mode)) return;
  const cols = await askColumns(mode);
  if (!cols) return;
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    `# DNA希釈計算結果 (${MODE_LABEL[mode]}) — ${timestamp()}`,
    `# ${paramLine(mode)}`,
    '',
    cols.map(([, d]) => esc(d)).join(','),
    ...state.results[mode].map((rec, i) => cols.map(([k]) => esc(fmtVal(rec, k, i))).join(',')),
  ];
  download(`dilution_${mode}_${fileStamp()}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSVをダウンロードしました');
}

// ===== HTML レポート出力（§8.7） =====
async function exportHtml(mode) {
  if (!ensureResults(mode)) return;
  const cols = await askColumns(mode);
  if (!cols) return;
  const useStrip = $(`${mode}-strip`).checked;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rows = state.results[mode].map((rec, i) => {
    const bg = rowColor(i, rec.warn, useStrip);
    const tds = cols.map(([k]) =>
      `<td class="${k === 'sample_id' ? 'left' : 'c'}">${esc(fmtVal(rec, k, i))}</td>`).join('');
    return `<tr${bg ? ` style="background:${bg}"` : ''}>${tds}</tr>`;
  }).join('\n');

  const legend = useStrip ? `<div class="legend"><b>8連チューブ色分け:</b>
  <span style="background:${STRIP_COLORS[0]}"></span>奇数グループ
  <span style="background:${STRIP_COLORS[1]}"></span>偶数グループ
  <span style="background:${WARN_COLOR}"></span>濃度不足</div>` : '';

  const formula = mode === 'nm'
    ? 'ターゲット(pg/µL) = MW/bp × 塩基長(bp) × ターゲット(nM) ÷ 1000<br>希釈水量(µL) = サンプル量 × ( Qubit(ng/µL) × 1000 ÷ ターゲット(pg/µL) − 1 )<br>半量 = 希釈水量 ÷ 2'
    : '希釈水量(µL) = サンプル量 × ( Qubit(ng/µL) ÷ ターゲット(ng/µL) − 1 )<br>半量 = 希釈水量 ÷ 2';

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>DNA希釈計算結果 (${MODE_LABEL[mode]})</title>
<style>
body{font-family:'Segoe UI','Meiryo',sans-serif;margin:24px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
h1{color:#2c5f8a;font-size:1.3em}
.meta{background:#f0f5fa;padding:10px 14px;border-radius:6px;font-size:.9em}
table{border-collapse:collapse;margin-top:14px}
th{background:#2c5f8a;color:#fff;padding:7px 12px;border:1px solid #2c5f8a}
td{border:1px solid #ccc;padding:6px 12px}
td.c{text-align:center}
td.left{text-align:left}
.formula{background:#fffbe6;border:1px solid #e8d98a;padding:10px 14px;border-radius:6px;margin-top:14px;font-size:.88em}
.legend{margin-top:12px;font-size:.88em}
.legend span{display:inline-block;width:18px;height:14px;border:1px solid #999;margin:0 4px 0 10px;vertical-align:middle}
.print-note{font-size:.82em;color:#666;margin-top:16px}
@media print{
  .no-print{display:none}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
  body{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  tr,td,th{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
}
</style></head><body>
<h1>DNA希釈計算結果 (${MODE_LABEL[mode]})</h1>
<div class="meta">出力日時: ${timestamp()}<br>${esc(paramLine(mode))}<br>件数: ${state.results[mode].length}</div>
<table><thead><tr>${cols.map(([, d]) => `<th>${esc(d)}</th>`).join('')}</tr></thead>
<tbody>
${rows}
</tbody></table>
${legend}
<div class="formula">${formula}</div>
<p class="no-print print-note">※ 印刷時に背景色が表示されない場合は、印刷設定で「背景のグラフィック」をONにしてください（Chrome/Edge: 詳細設定 → 背景のグラフィック ☑）。</p>
</body></html>`;

  download(`dilution_${mode}_${fileStamp()}.html`, html, 'text/html;charset=utf-8');
  toast('HTMLレポートをダウンロードしました');
}

// ===== クリップボードコピー（§8.8, タブ区切り） =====
async function copyClip(mode) {
  if (!ensureResults(mode)) return;
  const cols = await askColumns(mode);
  if (!cols) return;
  const text = [
    cols.map(([, d]) => d).join('\t'),
    ...state.results[mode].map((rec, i) => cols.map(([k]) => fmtVal(rec, k, i)).join('\t')),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('クリップボードにコピーしました');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('クリップボードにコピーしました');
  }
}

['nm', 'ng'].forEach((mode) => {
  $(`${mode}-csv`).addEventListener('click', () => exportCsv(mode));
  $(`${mode}-html`).addEventListener('click', () => exportHtml(mode));
  $(`${mode}-clip`).addEventListener('click', () => copyClip(mode));
});

// ===== 初期化 =====
refreshPresetCombo();
