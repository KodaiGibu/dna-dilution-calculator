/**
 * 仕様書 §12 テストケースの検証
 * 実行: npm test （node --test）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcNm, calcNg, stripTag, stripGroup, roundHalfEven, parseBulkNm } from '../src/calc.js';

const PARAMS_NM = { targetNm: 4.0, sampleUl: 10.0, mwPerBp: 660.0 };

// §12.1 nMモード
const nmCases = [
  ['例', 447, 23.1, 185.7, 92.9],
  ['Ishigaki_soil_1_16S', 600, 51.0, 312.0, 156.0],
  ['Ishigaki_soil_2_16S', 600, 52.8, 323.3, 161.7],
  ['Ishigaki_soil_3_16S', 600, 42.2, 256.4, 128.2],
  ['Ishigaki_soil_4_16S', 600, 47.2, 288.0, 144.0],
  ['Ishigaki_soil_5_16S', 600, 43.6, 265.3, 132.6],
];

test('§12.1 nMモードの希釈水量・半量', () => {
  for (const [sid, bp, qubit, expW, expH] of nmCases) {
    const r = calcNm({ sampleId: sid, bp, qubit, ...PARAMS_NM });
    assert.equal(r.water, expW, `${sid}: water ${r.water} != ${expW}`);
    assert.equal(r.half, expH, `${sid}: half ${r.half} != ${expH}`);
    assert.equal(r.warn, false);
  }
});

test('§6.1 計算例のターゲット濃度 (pg/µL)', () => {
  const r = calcNm({ sampleId: 'x', bp: 452, qubit: 23.1, ...PARAMS_NM });
  assert.equal(r.target_pg, 1193.28);
});

// §12.2 ng/µLモード
const ngCases = [
  ['Sample_A', 10.0, 2.0, 40.0, 20.0],
  ['Sample_B', 5.0, 2.0, 15.0, 7.5],
];

test('§12.2 ng/µLモードの希釈水量・半量', () => {
  for (const [sid, qubit, targetNg, expW, expH] of ngCases) {
    const r = calcNg({ sampleId: sid, qubit, targetNg, sampleUl: 10.0 });
    assert.equal(r.water, expW);
    assert.equal(r.half, expH);
  }
});

test('§12.2 濃度不足の判定', () => {
  const r = calcNg({ sampleId: 'Sample_C', qubit: 1.5, targetNg: 2.0, sampleUl: 10.0 });
  assert.equal(r.water, '濃度不足');
  assert.equal(r.half, '―');
  assert.equal(r.warn, true);
});

test('§8.4 8連タグと8連グループ', () => {
  assert.equal(stripTag(0, false, true), 'strip0');
  assert.equal(stripTag(7, false, true), 'strip0');
  assert.equal(stripTag(8, false, true), 'strip1');
  assert.equal(stripTag(16, false, true), 'strip0');
  assert.equal(stripTag(3, true, true), 'warn');
  assert.equal(stripTag(3, false, false), 'normal');
  assert.equal(stripGroup(0), 1);
  assert.equal(stripGroup(8), 2);
});

test('銀行丸め（round-half-to-even）', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(0.25, 1), 0.2);
  assert.equal(roundHalfEven(0.35, 1), 0.4);
});

test('一括入力のヘッダ行スキップ', () => {
  const rows = parseBulkNm('Sample ID\tbp\tQubit\nS1\t600\t51.0\nS2\t600\t52.8', 600);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sampleId, 'S1');
});
