#!/usr/bin/env node
// 에셋 게이트 — 하나라도 걸리면 실패한다. 실행: node tools/check-assets.mjs
//
// 라이선스는 사람이 기억으로 지킬 수 있는 게 아니다. 통과 목록에 없는 라이선스가
// CREDITS 에 들어오는 순간, 그리고 원장과 실제 파일이 어긋나는 순간 여기서 멈춘다.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const DIR = 'assets/lifeform'
const OK_LICENSE = new Set(['CC0 1.0', 'Public domain', 'PDM 1.0'])
const fails = []
const warns = []
const fail = m => fails.push(m)
const warn = m => warns.push(m)

const credits = JSON.parse(readFileSync(join(DIR, 'CREDITS.json'), 'utf8'))
const items = credits.items

// ① 라이선스 통과 목록 — CC-BY·SA·NC·ND 는 재배포 조건이 붙어 여기서 막는다
for (const it of items) {
  if (!OK_LICENSE.has(it.license)) fail(`① 허용되지 않은 라이선스: ${it.license} — ${it.file}`)
  if (!it.license_url || !it.page) fail(`① 출처 URL 누락 — ${it.file}`)
  if (!it.retrieved || !it.modifications) fail(`① retrieved/modifications 누락 — ${it.file}`)
}

// ② SVG 안의 실행 가능한 것 — 남의 SVG 를 그대로 재배포하는 이상 매번 본다
for (const f of readdirSync(DIR).concat(readdirSync(join(DIR, 'src')).map(x => 'src/' + x))) {
  if (!f.endsWith('.svg')) continue
  const s = readFileSync(join(DIR, f), 'utf8')
  if (/<script|\son\w+\s*=|javascript:|<foreignObject/i.test(s)) fail(`② SVG 에 스크립트/이벤트 핸들러: ${f}`)
  if (/xlink:href\s*=\s*["']https?:/i.test(s)) fail(`② SVG 가 외부 리소스를 참조: ${f}`)
}

// ③ 최적화 산출물이 실제로 쓸 수 있는 상태인가 (svgo 함정 두 개의 회귀 테스트)
for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.svg')) continue
  const s = readFileSync(join(DIR, f), 'utf8')
  if (!s.includes('currentColor')) fail(`③ fill=currentColor 없음 (색을 못 바꾼다): ${f}`)
  if (!/viewBox=/.test(s)) fail(`③ viewBox 없음 (크기 정보 소실): ${f}`)
  if (/<svg[^>]*\s(width|height)=/.test(s)) fail(`③ width/height 잔존 (potrace 의 pt → 20% 확대): ${f}`)
}

// ④ 원장 ↔ 실물 양방향 대조 + 원본 무결성
const listed = new Set(items.map(i => i.file))
for (const it of items) {
  if (!existsSync(it.file)) fail(`④ 원장에 있는데 파일이 없다: ${it.file}`)
  if (!existsSync(it.src)) fail(`④ 원본이 없다 (파생물만 남으면 재생성 불가): ${it.src}`)
  else {
    const h = createHash('sha256').update(readFileSync(it.src)).digest('hex')
    if (h !== it.sha256) fail(`④ 원본 sha256 불일치: ${it.src}\n      원장 ${it.sha256}\n      실제 ${h}`)
  }
}
for (const f of readdirSync(DIR)) {
  const p = join(DIR, f)
  if (statSync(p).isDirectory() || f === 'CREDITS.json') continue
  if (!listed.has(p)) fail(`④ 원장에 없는 파일이 배포된다: ${p}`)
}

// 용량 — 실패는 아니지만 조용히 무거워지는 걸 막는다
let total = 0
for (const f of readdirSync(DIR)) {
  const p = join(DIR, f)
  if (statSync(p).isDirectory()) continue
  total += statSync(p).size
}
if (total > 400 * 1024) warn(`배포 에셋 합계 ${Math.round(total / 1024)} KB — 400 KB 기준선 초과`)

for (const w of warns) console.warn('⚠ ' + w)
if (fails.length) { console.error(fails.map(m => '✗ ' + m).join('\n')); process.exit(1) }
console.log(`✓ 에셋 게이트 4종 통과 — ${items.length}개 항목, 배포분 ${Math.round(total / 1024)} KB`)
