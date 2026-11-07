# Threads 글 읽기 도구

Threads 공개 글의 본문·답글(🧵)·인용 글·첨부 이미지를 한 HTML 파일로 묶는다.
폰에서 파일 하나만 열면 전부 읽히도록 이미지는 파일 안에 넣는다.

## 쓰는 법

```
node tools/threads/fetch-threads.mjs <Threads 링크> [출력 폴더]
```

`threads.com/share/...` 공유 링크도, `threads.com/@계정/post/...` 링크도 된다.
결과는 `<출력 폴더>/thread.html` 과 `posts.json`.

## 클라우드 세션에서

Playwright 와 Chromium 이 이미 깔려 있으니 바로 실행된다.
환경의 네트워크 허용 목록에 아래 호스트가 있어야 한다 (Default 환경에는 넣어 둠).

- `www.threads.com`, `threads.com`
- `static.cdninstagram.com` — 페이지 스크립트. 이게 없으면 답글이 안 불려온다
- `scontent-*.cdninstagram.com` — 이미지. 번호가 글마다 달라 막히면 그 호스트를 하나 더 허용한다

## 로컬(맥)에서

```
npm i -g playwright && npx playwright install chromium
```

## 한계

- 로그인해야 보이는 글(비공개 계정 등)은 못 읽는다.
- 동영상은 썸네일만 들어간다.
- Threads 화면 구조가 바뀌면 글 구분(`data-pressable-container`)이 깨질 수 있다.
