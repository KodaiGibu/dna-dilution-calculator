/**
 * DNA希釈計算ツール v2.2 — UI レイヤー（Web移植版）
 * 移植元: dna_dilution_calculator.py の DNADilutionApp / GenePresetDialog / ColumnSelectDialog
 *
 * Python版との対応:
 *   load_presets()/save_presets()         → localStorage: dna_dilution_presets
 *   load_col_defaults()/save_col_defaults() → localStorage: dna_dilution_col_defaults
 *   filedialog.asksaveasfilename()        → ブラウザのダウンロード
 *   messagebox                            → <dialog> によるモーダル
 */
import {
  APP_TITLE, DEFAULT_SAMPLE_UL, STRIP_SIZE, STRIP_HTML_COLORS, WARN_COLOR,
  calcNmRecord, calcNgRecord, stripTag, fmtVal, pyFloat, bpDisplay,
  parseNmSeparate, parseNmBulk, parseNgSeparate, parseNgBulk,
  nowStr, fileStamp,
} from './calc.js';

const $ = (id) => document.getElementById(id);
const PRESET_KEY = 'dna_dilution_presets';
const COL_KEY = 'dna_dilution_col_defaults';

// ══ アプリ状態（Python版のインスタンス変数に対応）══
const app = {
  mode: 'nm',
  inputTab: { nm: 0, ng: 0 },   // nb_nm / nb_ng の index
  presets: loadPresets(),        // self.presets
  colDefaults: loadColDefaults(),// self.col_defaults
  resultsNm: [],                 // self.results_nm
  resultsNg: [],                 // self.results_ng
};

// ══ 永続化（Python版の JSON ファイル I/O 相当）══
function loadPresets() {
  try {
    const v = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function savePresets(presets) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets, null, 2)); } catch { /* pass */ }
}
function loadColDefaults() {
  try {
    const v = JSON.parse(localStorage.getItem(COL_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function saveColDefaults(defaults) {
  try { localStorage.setItem(COL_KEY, JSON.stringify(defaults, null, 2)); } catch { /* pass */ }
}

// ══ messagebox 相当 ══
const dlgMsg = $('dlg-msg');
function showMessage(title, body) {
  return new Promise((resolve) => {
    $('msg-title').textContent = title;
    $('msg-body').textContent = body;
    $('msg-cancel').classList.add('hidden');
    const ok = () => { cleanup(); resolve(true); };
    const cleanup = () => { $('msg-ok').removeEventListener('click', ok); dlgMsg.close(); };
    $('msg-ok').addEventListener('click', ok);
    dlgMsg.showModal();
  });
}
function askYesNo(title, body) {
  return new Promise((resolve) => {
    $('msg-title').textContent = title;
    $('msg-body').textContent = body;
    const cancelBtn = $('msg-cancel');
    cancelBtn.classList.remove('hidden');
    const done = (v) => {
      $('msg-ok').removeEventListener('click', yes);
      cancelBtn.removeEventListener('click', no);
      cancelBtn.classList.add('hidden');
      dlgMsg.close(); resolve(v);
    };
    const yes = () => done(true);
    const no = () => done(false);
    $('msg-ok').addEventListener('click', yes);
    cancelBtn.addEventListener('click', no);
    dlgMsg.showModal();
  });
}
function setStatus(text, isError = false) {
  const sb = $('statusbar');
  sb.textContent = text;
  sb.classList.toggle('error', isError);
}

// ══ モード切替（ttk.Notebook 相当）══
document.querySelectorAll('.mode-nb > .nb-tabs .nb-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    app.mode = btn.dataset.mode;
    document.querySelectorAll('.mode-nb > .nb-tabs .nb-tab')
      .forEach((b) => b.classList.toggle('active', b === btn));
    $('page-nm').classList.toggle('hidden', app.mode !== 'nm');
    $('page-ng').classList.toggle('hidden', app.mode !== 'ng');
  });
});

// 個別入力 / 一括入力タブ
document.querySelectorAll('[data-input-nb]').forEach((nb) => {
  const mode = nb.dataset.inputNb;
  nb.querySelectorAll('.nb-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      app.inputTab[mode] = Number(btn.dataset.input);
      nb.querySelectorAll('.nb-tab').forEach((b) => b.classList.toggle('active', b === btn));
      nb.querySelectorAll('[data-input-page]').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.inputPage !== btn.dataset.input);
      });
    });
  });
});

// ══ プリセット（_refresh_preset_combo_nm / _on_preset_nm）══
function refreshPresetComboNm() {
  const sel = $('nm-preset');
  sel.innerHTML = '<option value="-1"></option>';
  app.presets.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${p.name}  (${Math.trunc(p.bp)} bp)`;
    sel.appendChild(o);
  });
  sel.value = '-1';
}
$('nm-preset').addEventListener('change', (e) => {
  const idx = Number(e.target.value);
  if (idx < 0 || idx >= app.presets.length) return;
  $('nm-bp').value = bpDisplay(app.presets[idx].bp);
  $('nm-common').checked = true;
});

// ── GenePresetDialog 相当 ──
const dlgPreset = $('dlg-preset');
$('nm-preset-mgr').addEventListener('click', () => { refreshPresetList(); dlgPreset.showModal(); });
$('preset-close').addEventListener('click', () => dlgPreset.close());

function refreshPresetList() {
  const lb = $('preset-list');
  lb.innerHTML = '';
  app.presets.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${p.name}  (${Math.trunc(p.bp)} bp)`;
    lb.appendChild(o);
  });
  $('preset-name').value = '';
  $('preset-bp').value = '';
}
$('preset-list').addEventListener('change', (e) => {   // _on_select
  const p = app.presets[Number(e.target.value)];
  if (!p) return;
  $('preset-name').value = p.name;
  $('preset-bp').value = bpDisplay(p.bp);
});
async function validatePreset() {                       // _validate
  const name = $('preset-name').value.trim();
  const bpS = $('preset-bp').value.trim();
  if (!name) { await showMessage('入力エラー', '遺伝子名を入力してください。'); return null; }
  const bp = Number(bpS);
  if (!Number.isFinite(bp) || bp <= 0) {
    await showMessage('入力エラー', '塩基長に正の数値を入力してください。'); return null;
  }
  return { name, bp };
}
function saveAndRefreshPresets() {                      // _save_and_refresh
  savePresets(app.presets);
  refreshPresetComboNm();
  refreshPresetList();
}
$('preset-add').addEventListener('click', async () => {         // _add
  const p = await validatePreset(); if (!p) return;
  if (app.presets.some((x) => x.name === p.name && x.bp === p.bp)) {
    await showMessage('重複', '同じプリセットが既に存在します。'); return;
  }
  app.presets.push(p); saveAndRefreshPresets();
});
$('preset-update').addEventListener('click', async () => {      // _update
  const idx = Number($('preset-list').value);
  if (!app.presets[idx]) { await showMessage('選択エラー', '編集するプリセットを選択してください。'); return; }
  const p = await validatePreset(); if (!p) return;
  app.presets[idx] = p; saveAndRefreshPresets();
});
$('preset-delete').addEventListener('click', async () => {      // _delete
  const idx = Number($('preset-list').value);
  if (!app.presets[idx]) { await showMessage('選択エラー', '削除するプリセットを選択してください。'); return; }
  const p = app.presets[idx];
  if (!await askYesNo('削除確認', `「${p.name} (${Math.trunc(p.bp)} bp)」を削除しますか？`)) return;
  app.presets.splice(idx, 1); saveAndRefreshPresets();
});

// ══ nM 計算（_get_params_nm / _parse_nm / _calc_nm）══
function getParamsNm() {
  const targetNm = pyFloat($('nm-target').value, 'ターゲット濃度');
  const sampleUl = pyFloat($('nm-sample').value, 'サンプル量');
  const mw = pyFloat($('nm-mw').value, 'MW per bp');
  if (targetNm <= 0 || sampleUl <= 0 || mw <= 0) throw new Error('正の値を入力してください。');
  let commonBp = null;
  if ($('nm-common').checked) {
    commonBp = pyFloat($('nm-bp').value, '塩基長');
    if (commonBp <= 0) throw new Error('正の値を入力してください。');
  }
  return { targetNm, sampleUl, mw, commonBp };
}
$('nm-calc').addEventListener('click', async () => {
  let p;
  try { p = getParamsNm(); }
  catch (e) { await showMessage('パラメータエラー', `計算パラメータを確認してください。\n${e.message}`); return; }

  let samples;
  try {
    samples = app.inputTab.nm === 0
      ? parseNmSeparate($('nm-ids').value, $('nm-bps').value, $('nm-conc').value, p.commonBp)
      : parseNmBulk($('nm-bulk').value, p.commonBp);
  } catch (e) { await showMessage('入力エラー', e.message); return; }

  app.resultsNm = [];
  let warnCnt = 0;
  for (const [sid, bp, qubit] of samples) {
    const rec = calcNmRecord(sid, bp, qubit, p.targetNm, p.sampleUl, p.mw);
    if (rec.warn) warnCnt += 1;
    app.resultsNm.push(rec);
  }
  refreshTreeNm();
  const bpInfo = p.commonBp ? `共通 ${bpDisplay(p.commonBp)} bp` : '個別';
  setStatus(`[nM] 計算完了: ${app.resultsNm.length}件 | ${p.targetNm} nM | ${p.sampleUl} µL | ` +
            `${bpInfo} | 濃度不足: ${warnCnt}件 | ${nowStr()}`);
});

function refreshTreeNm() {                                // _refresh_tree_nm
  const tbody = $('nm-tree').querySelector('tbody');
  tbody.innerHTML = '';
  const useStrip = $('nm-strip').checked;
  app.resultsNm.forEach((rec, idx) => {
    const tr = document.createElement('tr');
    tr.className = stripTag(idx, rec.warn, useStrip);
    const cells = [
      fmtVal(rec, 'sample_id', idx), fmtVal(rec, 'bp', idx), fmtVal(rec, 'qubit', idx),
      fmtVal(rec, 'target_pg', idx), fmtVal(rec, 'water', idx), fmtVal(rec, 'half', idx),
    ];
    cells.forEach((v, ci) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (ci === 0) td.className = 'left';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
$('nm-clear').addEventListener('click', () => {           // _clear_nm
  ['nm-ids', 'nm-bps', 'nm-conc', 'nm-bulk'].forEach((id) => { $(id).value = ''; });
  app.resultsNm = []; refreshTreeNm(); setStatus('クリアしました');
});
$('nm-strip').addEventListener('change', refreshTreeNm);

// ══ ng/µL 計算（_parse_ng / _calc_ng）══
$('ng-calc').addEventListener('click', async () => {
  let targetNg, sampleUl;
  try {
    targetNg = pyFloat($('ng-target').value, 'ターゲット濃度');
    sampleUl = pyFloat($('ng-sample').value, 'サンプル量');
    if (targetNg <= 0 || sampleUl <= 0) throw new Error();
  } catch { await showMessage('パラメータエラー', '計算パラメータに正の数値を入力してください。'); return; }

  let samples;
  try {
    samples = app.inputTab.ng === 0
      ? parseNgSeparate($('ng-ids').value, $('ng-conc').value)
      : parseNgBulk($('ng-bulk').value);
  } catch (e) { await showMessage('入力エラー', e.message); return; }

  app.resultsNg = [];
  let warnCnt = 0;
  for (const [sid, qubit] of samples) {
    const rec = calcNgRecord(sid, qubit, targetNg, sampleUl);
    if (rec.warn) warnCnt += 1;
    app.resultsNg.push(rec);
  }
  refreshTreeNg();
  setStatus(`[ng/µL] 計算完了: ${app.resultsNg.length}件 | ${targetNg} ng/µL | ${sampleUl} µL | ` +
            `濃度不足: ${warnCnt}件 | ${nowStr()}`);
});

function refreshTreeNg() {                                // _refresh_tree_ng
  const tbody = $('ng-tree').querySelector('tbody');
  tbody.innerHTML = '';
  const useStrip = $('ng-strip').checked;
  app.resultsNg.forEach((rec, idx) => {
    const tr = document.createElement('tr');
    tr.className = stripTag(idx, rec.warn, useStrip);
    const cells = [
      fmtVal(rec, 'sample_id', idx), fmtVal(rec, 'qubit', idx),
      fmtVal(rec, 'target_ng', idx), fmtVal(rec, 'water', idx), fmtVal(rec, 'half', idx),
    ];
    cells.forEach((v, ci) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (ci === 0) td.className = 'left';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
$('ng-clear').addEventListener('click', () => {           // _clear_ng
  ['ng-ids', 'ng-conc', 'ng-bulk'].forEach((id) => { $(id).value = ''; });
  app.resultsNg = []; refreshTreeNg(); setStatus('クリアしました');
});
$('ng-strip').addEventListener('change', refreshTreeNg);

// ══ 出力列（_build_export_columns）══
function buildExportColumns(mode) {
  let results, useStrip, sampleUl, params, modeLabel, allColumns;
  if (mode === 'nm') {
    results = app.resultsNm;
    useStrip = $('nm-strip').checked;
    sampleUl = Number($('nm-sample').value.trim());
    if (!Number.isFinite(sampleUl)) sampleUl = DEFAULT_SAMPLE_UL;
    params = `ターゲット: ${$('nm-target').value} nM, サンプル量: ${$('nm-sample').value} µL, MW/bp: ${$('nm-mw').value} g`;
    modeLabel = 'モル濃度希釈 (nM)';
    allColumns = [
      ['sample_id', 'サンプルID'], ['bp', '塩基長(bp)'], ['qubit', 'Qubit(ng/µL)'],
      ['target_pg', 'ターゲット(pg/µL)'], ['water', '希釈水量(µL)'], ['half', `半量(${(sampleUl / 2).toFixed(1)}µL)`],
    ];
  } else {
    results = app.resultsNg;
    useStrip = $('ng-strip').checked;
    sampleUl = Number($('ng-sample').value.trim());
    if (!Number.isFinite(sampleUl)) sampleUl = DEFAULT_SAMPLE_UL;
    params = `ターゲット: ${$('ng-target').value} ng/µL, サンプル量: ${$('ng-sample').value} µL`;
    modeLabel = '濃度希釈 (ng/µL)';
    allColumns = [
      ['sample_id', 'サンプルID'], ['qubit', 'Qubit(ng/µL)'],
      ['target_ng', 'ターゲット(ng/µL)'], ['water', '希釈水量(µL)'], ['half', `半量(${(sampleUl / 2).toFixed(1)}µL)`],
    ];
  }
  if (useStrip) allColumns.push(['strip_group', '8連グループ']);
  return { allColumns, results, useStrip, params, modeLabel, sampleUl };
}

// ── 列デフォルト（_save_col_default / _load_col_default）──
function saveColDefault(mode, keys) { app.colDefaults[mode] = keys; saveColDefaults(app.colDefaults); }
function loadColDefault(mode) { return app.colDefaults[mode] ?? null; }

// ── ColumnSelectDialog 相当（_ask_columns）──
const dlgCols = $('dlg-columns');
async function askColumns(mode) {
  const info = buildExportColumns(mode);
  if (!info.results.length) { await showMessage('データなし', '先に計算を実行してください。'); return null; }

  const allKeys = info.allColumns.map(([k]) => k);
  const saved = loadColDefault(mode);
  let defaultKeys = saved ? saved.filter((k) => allKeys.includes(k)) : null;
  if (defaultKeys && !defaultKeys.length) defaultKeys = null;

  const box = $('col-checks');
  box.innerHTML = '';
  info.allColumns.forEach(([key, disp]) => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = key;
    cb.checked = defaultKeys === null ? true : defaultKeys.includes(key);
    label.append(cb, document.createTextNode(' ' + disp));
    box.appendChild(label);
  });
  const boxes = () => [...box.querySelectorAll('input')];
  const checkedKeys = () => boxes().filter((c) => c.checked).map((c) => c.value);

  return new Promise((resolve) => {
    const allOn = () => boxes().forEach((c) => { c.checked = true; });
    const allOff = () => boxes().forEach((c) => { c.checked = false; });
    const saveDef = async () => {
      const sel = checkedKeys();
      if (!sel.length) { await showMessage('選択エラー', '少なくとも1列を選択してください。'); return; }
      saveColDefault(mode, sel);
      await showMessage('デフォルト保存', '現在の選択をデフォルトに設定しました。');
    };
    const restoreDef = () => {
      const s = loadColDefault(mode);
      boxes().forEach((c) => { c.checked = s === null ? true : s.includes(c.value); });
    };
    const finish = (value) => {
      $('col-all-on').removeEventListener('click', allOn);
      $('col-all-off').removeEventListener('click', allOff);
      $('col-save-def').removeEventListener('click', saveDef);
      $('col-restore-def').removeEventListener('click', restoreDef);
      $('col-ok').removeEventListener('click', ok);
      $('col-cancel').removeEventListener('click', cancel);
      dlgCols.close();
      resolve(value);
    };
    const ok = async () => {
      const keys = checkedKeys();
      if (!keys.length) { await showMessage('選択エラー', '少なくとも1列を選択してください。'); return; }
      const sel = info.allColumns.filter(([k]) => keys.includes(k));
      finish({ selKeys: sel.map(([k]) => k), selHeads: sel.map(([, d]) => d), ...info });
    };
    const cancel = () => finish(null);

    $('col-all-on').addEventListener('click', allOn);
    $('col-all-off').addEventListener('click', allOff);
    $('col-save-def').addEventListener('click', saveDef);
    $('col-restore-def').addEventListener('click', restoreDef);
    $('col-ok').addEventListener('click', ok);
    $('col-cancel').addEventListener('click', cancel);
    dlgCols.showModal();
  });
}

// ══ ファイル保存（filedialog 相当）══
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ══ CSV 出力（_export_csv, UTF-8 BOM 付き）══
async function exportCsv(mode) {
  const info = await askColumns(mode);
  if (!info) return;
  const { selKeys, selHeads, results, params, modeLabel } = info;
  const esc = (v) => (/[",\r\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [
    esc(`# DNA希釈計算結果 (${modeLabel}) — ${nowStr()}`),
    esc(`# ${params}`),
    '',
    selHeads.map(esc).join(','),
    ...results.map((rec, idx) => selKeys.map((k) => esc(fmtVal(rec, k, idx))).join(',')),
  ];
  const name = `dilution_${mode}_${fileStamp()}.csv`;
  downloadFile(name, '\uFEFF' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  await showMessage('完了', `CSVを保存しました。\n${name}`);
}

// ══ HTML レポート出力（_export_html, 印刷時の背景色保持対応）══
async function exportHtml(mode) {
  const info = await askColumns(mode);
  if (!info) return;
  const { selKeys, selHeads, results, useStrip, params, modeLabel } = info;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const thRow = selHeads.map((h) => `<th>${esc(h)}</th>`).join('');
  let rowsHtml = '';
  results.forEach((rec, idx) => {
    let style = '';
    if (rec.warn) style = ` style="background:${WARN_COLOR}"`;
    else if (useStrip) style = ` style="background:${STRIP_HTML_COLORS[Math.floor(idx / STRIP_SIZE) % 2]}"`;
    else if (idx % 2 === 1) style = ' style="background:#f9f9f9"';
    const cells = selKeys.map((k) =>
      `<td class='${k === 'sample_id' ? 'left' : 'c'}'>${esc(fmtVal(rec, k, idx))}</td>`).join('');
    rowsHtml += `<tr${style}>${cells}</tr>\n`;
  });

  const formulaHtml = mode === 'nm'
    ? 'ターゲット (pg/µL) = MW_per_bp × 塩基長 × ターゲット(nM) ÷ 1000<br>希釈水量 X (µL) = サンプル量 × ( Qubit(ng/µL)×1000 ÷ ターゲット(pg/µL) − 1 )<br>半量 = 希釈水量 ÷ 2'
    : '希釈水量 X (µL) = サンプル量 × ( Qubit濃度(ng/µL) ÷ ターゲット(ng/µL) − 1 )<br>半量 = 希釈水量 ÷ 2';

  const legend = useStrip ? `<div class="legend">
<b>8連チューブ色分け:</b>
<span style="background:${STRIP_HTML_COLORS[0]}"></span>奇数グループ
<span style="background:${STRIP_HTML_COLORS[1]}; margin-left:12px;"></span>偶数グループ
<span style="background:${WARN_COLOR}; margin-left:12px;"></span>濃度不足
</div>` : '';

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>DNA希釈計算レポート</title>
<style>
body { font-family:'Segoe UI','Meiryo',sans-serif; margin:30px; color:#333;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { color:#2c5f8a; font-size:22px; border-bottom:2px solid #2c5f8a; padding-bottom:6px; }
.meta { background:#f0f5fa; padding:12px 18px; border-radius:6px; margin:16px 0; font-size:14px; line-height:1.7; }
table { border-collapse:collapse; width:100%; margin-top:16px; font-size:14px; }
th { background:#2c5f8a; color:#fff; padding:8px 12px; text-align:center; }
td { border:1px solid #ccc; padding:6px 12px; }
td.c { text-align:center; }
td.left { text-align:left; }
.formula { background:#fffbe6; border:1px solid #e8d98a; padding:12px 18px; border-radius:6px; margin:16px 0; font-size:13px; line-height:1.8; }
.footer { margin-top:20px; font-size:12px; color:#888; }
.legend { margin:12px 0; font-size:13px; }
.legend span { display:inline-block; width:18px; height:14px; border:1px solid #ccc; vertical-align:middle; margin-right:4px; }
.print-note { font-size:12px; color:#888; margin-top:4px; }
@media print {
  .no-print { display: none; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  tr, td, th { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
</style></head><body>
<h1>\u{1F9EC} DNA希釈計算レポート — ${esc(modeLabel)}</h1>
<button class="no-print" onclick="window.print()" style="padding:6px 16px;font-size:14px;cursor:pointer;">\u{1F5A8}\u{FE0F} 印刷</button>
<p class="no-print print-note">\u203B 印刷時に背景色が表示されない場合は、印刷設定で「背景のグラフィック」をONにしてください（Chrome/Edge: 詳細設定 → 背景のグラフィック ☑）</p>
<div class="meta">
<b>日時:</b> ${nowStr()}<br>
<b>${esc(params)}</b><br>
<b>サンプル数:</b> ${results.length}
</div>
<div class="formula"><b>計算式:</b><br>${formulaHtml}</div>
${legend}
<table><tr>${thRow}</tr>
${rowsHtml}</table>
<div class="footer">DNA希釈計算ツール v2.2 で生成</div></body></html>`;

  const name = `dilution_${mode}_${fileStamp()}.html`;
  downloadFile(name, html, 'text/html;charset=utf-8');
  // Python版は保存後に webbrowser.open() する → Web版は別タブでプレビューを開く
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  await showMessage('完了', `HTMLレポートを保存しました。\n${name}`);
}

// ══ クリップボードコピー（_copy_clip）══
async function copyClip(mode) {
  const info = await askColumns(mode);
  if (!info) return;
  const { selKeys, selHeads, results } = info;
  const lines = [selHeads.join('\t')];
  results.forEach((rec, idx) => lines.push(selKeys.map((k) => fmtVal(rec, k, idx)).join('\t')));
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  setStatus(`クリップボードにコピーしました（${results.length}件, ${selKeys.length}列）`);
}

['nm', 'ng'].forEach((mode) => {
  $(`${mode}-csv`).addEventListener('click', () => exportCsv(mode));
  $(`${mode}-html`).addEventListener('click', () => exportHtml(mode));
  $(`${mode}-clip`).addEventListener('click', () => copyClip(mode));
});

// ══ テストデータ入力（Web版のみの補助機能）══
$('nm-demo').addEventListener('click', () => {
  $('nm-ids').value = ['Ishigaki_soil_1_16S', 'Ishigaki_soil_2_16S', 'Ishigaki_soil_3_16S',
    'Ishigaki_soil_4_16S', 'Ishigaki_soil_5_16S'].join('\n');
  $('nm-bps').value = '';
  $('nm-conc').value = ['51.0', '52.8', '42.2', '47.2', '43.6'].join('\n');
  $('nm-bulk').value = ['サンプルID\t塩基長\tQubit', 'Ishigaki_soil_1_16S\t600\t51.0',
    'Ishigaki_soil_2_16S\t600\t52.8'].join('\n');
  setStatus('テストデータを入力しました（4 nM / 10 µL / 600 bp で計算 → 312.0, 323.3 …）');
});
$('ng-demo').addEventListener('click', () => {
  $('ng-ids').value = 'Sample_A\nSample_B\nSample_C';
  $('ng-conc').value = '10.0\n5.0\n1.5';
  $('ng-bulk').value = 'Sample_A\t10.0\nSample_B\t5.0\nSample_C\t1.5';
  setStatus('テストデータを入力しました（2 ng/µL / 10 µL で計算 → 40.0, 15.0, 濃度不足）');
});

// ══ 初期化 ══
document.title = APP_TITLE;
refreshPresetComboNm();
setStatus('準備完了');
