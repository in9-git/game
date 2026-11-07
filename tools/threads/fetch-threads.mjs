#!/usr/bin/env node
// Threads 글 읽기 도구 — 공개 글의 본문·답글·인용·첨부 이미지를 한 HTML 파일로 묶는다.
//
// 실행: node tools/threads/fetch-threads.mjs <Threads 링크> [출력 폴더]
//   예: node tools/threads/fetch-threads.mjs https://www.threads.com/share/BAClKhgdhN /tmp/thread
//
// 결과: <출력 폴더>/thread.html (이미지가 base64 로 들어 있어 파일 하나로 읽힌다)
//       <출력 폴더>/posts.json  (글 단위 원본 데이터)
//
// 필요한 것: Node 18+, playwright (클라우드 세션에는 이미 있고, 로컬이면 npm i -g playwright 뒤 npx playwright install chromium)
// 네트워크: www.threads.com, static.cdninstagram.com, scontent-*.cdninstagram.com 이 열려 있어야 한다.
// 한계: 로그인해야 보이는 글(비공개 계정, 일부 답글)은 못 읽는다. 동영상은 썸네일만 가져온다.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright') // 전역 설치본도 찾도록 require 로 읽는다
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [url, outDir = 'thread-out'] = process.argv.slice(2)
if (!url) { console.error('사용법: node tools/threads/fetch-threads.mjs <Threads 링크> [출력 폴더]'); process.exit(1) }
mkdirSync(outDir, { recursive: true })

// ① 헤드리스 브라우저로 열고 끝까지 스크롤해 답글을 전부 불러온다
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 700, height: 1200 }, locale: 'ko-KR' })).newPage()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
let last = 0
for (let i = 0; i < 60; i++) {
  await page.mouse.wheel(0, 2500)
  await page.waitForTimeout(1200)
  const h = await page.evaluate(() => document.body.scrollHeight)
  if (h === last && i > 5) break
  last = h
}
await page.waitForTimeout(2000)

// ② 글 단위 컨테이너에서 텍스트와 이미지 주소를 뽑는다 (인용 글은 상위 글 안에 중첩돼 있다)
const raw = await page.evaluate(() =>
  Array.from(document.querySelectorAll('div[data-pressable-container="true"]')).map(c => ({
    text: c.innerText,
    imgs: Array.from(c.querySelectorAll('img'))
      .map(i => i.currentSrc || i.src)
      .filter(s => s.includes('cdninstagram') && !s.includes('-19/')), // -19 는 프로필 사진
  })))
const title = await page.title()
const finalUrl = page.url()
await browser.close()

// ③ 머리글(이름·시간·'작성자')과 꼬리(좋아요 수 등)를 떼어 본문만 남긴다
const DATE = /^(\d+시간|\d+일|\d+분|\d{4}-\d{2}-\d{2})$/
const HEAD = new Set(['·', '작성자', '인용'])
const TAIL = new Set(['더 알아보기', '인용', '죄송합니다. 이 동영상을 재생하는 중 문제가 발생했습니다.'])
function clean(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const head = [], body = []
  let user = ''
  for (const l of lines) {
    if (!body.length && (HEAD.has(l) || DATE.test(l) || l.endsWith('님에게 남긴 답글') || (!user && /^[\w.]+$/.test(l)))) {
      if (!user && /^[\w.]+$/.test(l)) user = l
      head.push(l); continue
    }
    body.push(l)
  }
  while (body.length && (/^[\d,.만천]+$/.test(body.at(-1)) || TAIL.has(body.at(-1)))) body.pop()
  return { user, when: head.find(h => DATE.test(h)) || '', isAuthor: head.includes('작성자'), body }
}

// ④ 이미지를 받아 base64 로 넣는다 (페이지가 쓰는 썸네일 크기 그대로, 보통 570px 폭)
const cache = new Map()
async function dataUri(src) {
  if (cache.has(src)) return cache.get(src)
  let v = null
  try { // Node 의 fetch 는 프록시 환경변수를 무시하므로 curl 로 받는다
    const buf = execFileSync('curl', ['-sS', '--fail', '-L', src], { maxBuffer: 64 * 1024 * 1024 })
    v = `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {}
  cache.set(src, v)
  return v
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const posts = []
const parts = []
for (let i = 0; i < raw.length; i++) {
  const p = clean(raw[i].text)
  if (!p.body.length) continue
  if (i === 0) p.isAuthor = true
  let srcs = raw[i].imgs
  const next = raw[i + 1]
  if (next && next.text.trim() && raw[i].text.includes(next.text.trim())) { // 바로 다음이 중첩된 인용이면 그 이미지는 인용 쪽 것
    const nested = new Set(next.imgs)
    srcs = srcs.filter(s => !nested.has(s))
  }
  const imgs = []
  for (const s of [...new Set(srcs)]) { const d = await dataUri(s); if (d) imgs.push(d) }
  posts.push({ ...p, imgs: [...new Set(srcs)] })
  const cls = p.isAuthor ? 'main' : 'quote'
  parts.push(`<article class="${cls}"><div class="meta">${esc(p.user)} · ${esc(p.when)}${p.isAuthor ? '' : ' · 인용된 이전 글'}</div>`
    + p.body.map(l => `<p>${esc(l)}</p>`).join('')
    + imgs.map(d => `<img src="${d}" loading="lazy">`).join('') + '</article>')
}

const nMain = posts.filter(p => p.isAuthor).length
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title.slice(0, 60))}</title>
<style>:root{--bg:#fff;--fg:#111;--mut:#777;--qbg:#f3f3f3;--line:#e5e5e5}@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#999;--qbg:#1d1d1d;--line:#333}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:18px;margin:0 0 4px}.src{color:var(--mut);font-size:13px;margin-bottom:20px;word-break:break-all}article{padding:14px 0;border-top:1px solid var(--line)}
article.quote{background:var(--qbg);padding:12px;margin:0 0 8px 16px;border-radius:10px;border:0;font-size:14px}
.meta{color:var(--mut);font-size:13px;margin-bottom:6px}p{margin:0 0 8px}img{display:block;width:100%;height:auto;border-radius:8px;margin:8px 0}</style></head><body><main>
<h1>${esc(title)}</h1><div class="src">원문: ${esc(finalUrl.split('?')[0])} · 수집 ${new Date().toISOString().slice(0, 10)} · 본문 ${nMain}개, 인용 ${posts.length - nMain}개</div>
${parts.join('\n')}</main></body></html>`

writeFileSync(join(outDir, 'thread.html'), html)
writeFileSync(join(outDir, 'posts.json'), JSON.stringify(posts, null, 1))
console.log(`본문 ${nMain}개, 인용 ${posts.length - nMain}개, 이미지 ${[...cache.values()].filter(Boolean).length}장 → ${join(outDir, 'thread.html')}`)
