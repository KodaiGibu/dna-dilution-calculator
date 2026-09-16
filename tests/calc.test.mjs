/**
 * 移植元 dna_dilution_calculator.py との計算・表示文字列の一致検証
 * 実行: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcNmRecord, calcNgRecord, stripTag, fmtVal, pyRound, pyStr,
  parseNmBulk, parseNmSeparate, parseNgBulk,
  PRESETS, presetLabel,
} from '../src/calc.js';

const TARGET_NM = 4.0, SAMPLE_UL = 10.0, MW = 660.0;

test('nMモード: 希釈水量・半量', () => {
  const cases = [
    ['例', 447, 23.1, 185.7, 92.9],
    ['Ishigaki_soil_1_16S', 600, 51.0, 312.0, 156.0],
    ['Ishigaki_soil_2_16S', 600, 52.8, 323.3, 161.7],
    ['Ishigaki_soil_3_16S', 600, 42.2, 256.4, 128.2],
    ['Ishigaki_soil_4_16S', 600, 47.2, 288.0, 144.0],
    ['Ishigaki_soil_5_16S', 600, 43.6, 265.3, 132.6],
  ];
  for (const [sid, bp, q, expW, expH] of cases) {
    const r = calcNmRecord(sid, bp, q, TARGET_NM, SAMPLE_UL, MW);
    assert.equal(r.water, expW, `${sid}: water ${r.water} != ${expW}`);
    assert.equal(r.half, expH, `${sid}: half ${r.half} != ${expH}`);
    assert.equal(r.warn, false);
  }
});

test('nMモード: ターゲット(pg/µL) と濃度不足', () => {
  assert.equal(calcNmRecord('x', 452, 23.1, TARGET_NM, SAMPLE_UL, MW).target_pg, 1193.28);
  const low = calcNmRecord('low', 600, 1.0, TARGET_NM, SAMPLE_UL, MW);
  assert.equal(low.water, '濃度不足');
  assert.equal(low.half, '―');
  assert.equal(low.warn, true);
});

test('ng/µLモード: 希釈水量・半量・濃度不足', () => {
  const a = calcNgRecord('Sample_A', 10.0, 2.0, 10.0);
  assert.equal(a.water, 40.0); assert.equal(a.half, 20.0);
  const b = calcNgRecord('Sample_B', 5.0, 2.0, 10.0);
  assert.equal(b.water, 15.0); assert.equal(b.half, 7.5);
  const c = calcNgRecord('Sample_C', 1.5, 2.0, 10.0);
  assert.equal(c.water, '濃度不足'); assert.equal(c.half, '―'); assert.equal(c.warn, true);
});

test('Python round() 互換（偶数丸め）', () => {
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(3.5), 4);
  assert.equal(pyRound(0.25, 1), 0.2);
  assert.equal(pyRound(0.35, 1), 0.4);
  assert.equal(pyRound(185.749333, 1), 185.7);
});

test('Python str(float) 互換の表示文字列', () => {
  assert.equal(pyStr(312.0), '312.0');
  assert.equal(pyStr(1584.0), '1584.0');
  assert.equal(pyStr(1193.28), '1193.28');
  assert.equal(pyStr('濃度不足'), '濃度不足');
});

test('_fmt_val 互換: bp は int 表示、strip_group は 1 始まり', () => {
  const rec = calcNmRecord('s', 600.0, 51.0, TARGET_NM, SAMPLE_UL, MW);
  assert.equal(fmtVal(rec, 'bp', 0), '600');
  assert.equal(fmtVal(rec, 'qubit', 0), '51.0');
  assert.equal(fmtVal(rec, 'water', 0), '312.0');
  assert.equal(fmtVal(rec, 'strip_group', 0), '1');
  assert.equal(fmtVal(rec, 'strip_group', 8), '2');
  assert.equal(fmtVal(rec, 'strip_group', 16), '3');
});

test('_strip_tag 互換', () => {
  assert.equal(stripTag(0, false, true), 'strip0');
  assert.equal(stripTag(7, false, true), 'strip0');
  assert.equal(stripTag(8, false, true), 'strip1');
  assert.equal(stripTag(16, false, true), 'strip0');
  assert.equal(stripTag(3, true, true), 'warn');
  assert.equal(stripTag(3, false, false), 'normal');
});

test('一括入力: ヘッダ行スキップとカンマ区切り', () => {
  const rows = parseNmBulk('SampleID\tbp\tQubit\nS1\t600\t51.0\nS2\t600\t52.8', null);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['S1', 600, 51.0]);
  const csv = parseNgBulk('Sample_A,10.0\nSample_B,5.0');
  assert.equal(csv.length, 2);
  assert.deepEqual(csv[1], ['Sample_B', 5.0]);
});

test('一括入力: 共通塩基長ONなら bp 列を無視', () => {
  const rows = parseNmBulk('S1\t999\t51.0', 600);
  assert.equal(rows[0][1], 600);
});

test('個別入力: 行数不一致・塩基長不足のエラーメッセージ', () => {
  assert.throws(() => parseNmSeparate('S1\nS2', '', '51.0', 600),
    /サンプルID \(2行\) と Qubit濃度 \(1行\) の行数が不一致。/);
  assert.throws(() => parseNmSeparate('S1', '', '51.0', null), /塩基長が不足（行1: S1）/);
  assert.throws(() => parseNmSeparate('', '', '', 600), /サンプルIDを入力してください。/);
});

test('固定プリセットの内容', () => {
  assert.equal(PRESETS.length, 7);
  assert.deepEqual(PRESETS.map((p) => p.primer),
    ['341-805', 'F04/R22mod', 'TAReuk', '14F1/s15.3', '14F3/s17', 'SYM_VAL', 'MiFish']);
  assert.deepEqual(PRESETS.map((p) => p.bp), [600, 501, 517, 262, 464, 452, 328]);
  assert.equal(presetLabel(PRESETS[0]), '341-805 / 16S V3〜V4 (600 bp)');
  assert.ok(PRESETS.every((p) => p.region && p.bp > 0));
});

test('プリセット選択時の計算（SYM_VAL 452 bp）', () => {
  const r = calcNmRecord('sym', 452, 23.1, TARGET_NM, SAMPLE_UL, MW);
  assert.equal(r.target_pg, 1193.28);
  assert.equal(r.water, 183.6);
  assert.equal(r.half, 91.8);
});
