// 把 Celeris 星表 (stars.json.gz) 转成网页可直接 <script> 引入的精简文件 data/stars.js
// 用法：node tools/build-stars.mjs
// 星表来源：Celeris (HYG v4.1 改编)，CC BY-SA 4.0  https://celeris-app.com/star-catalog.html
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(gunzipSync(readFileSync(join(here, 'stars.json.gz'))).toString('utf8'));

const LIMIT_MAG = 6.0; // 肉眼极限附近，背景星够用

// "Gam Cen" → "γ Cen"，"41    Tau" → "41 Tau"
const GREEK = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π',
  Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};
function cleanName(n) {
  if (!n) return '';
  n = n.replace(/\s+/g, ' ').trim();
  // 可带 Flamsteed 编号前缀：16Lam And / 55Zet1Aqr / Gam Cen
  const m = n.match(/^(?:\d+\s?)?([A-Z][a-z]{1,2})(\d?)\s?([A-Z][a-z]{2})$/);
  if (m && GREEK[m[1]]) return GREEK[m[1]] + (m[2] ? superscript(m[2]) : '') + ' ' + m[3];
  return n;
}
function superscript(d) {
  return d.replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
}
const stars = raw
  .filter(s => !s.type && s.vMag != null && s.vMag <= LIMIT_MAG)
  .sort((a, b) => a.vMag - b.vMag)
  .map(s => [
    +s.raHours.toFixed(4),
    +s.decDeg.toFixed(3),
    +s.vMag.toFixed(2),
    s.bV == null ? 0.6 : +s.bV.toFixed(2),
    cleanName(s.name),
  ]);

const out =
  '// 自动生成，请勿手改。来源：Celeris 星表 (HYG v4.1)，CC BY-SA 4.0\n' +
  '// 字段：[赤经(时), 赤纬(度), 视星等, B-V 色指数, 名称]，按亮度排序\n' +
  'window.STAR_CATALOG=' + JSON.stringify(stars) + ';\n';

writeFileSync(join(here, '..', 'data', 'stars.js'), out);
console.log(`stars: ${stars.length}, bytes: ${out.length}`);
console.log('sample:', stars.slice(0, 5));
