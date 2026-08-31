// 「말없는 자연 관찰」 라인 — PhyloPic 실루엣 최적화 설정
//
// 함정 두 개가 이 파일의 존재 이유다 (2026-09-01 실사에서 실측):
//  1) potrace 출력의 fill="#000000" 은 SVG 기본값이라 svgo 가 지운다.
//     → addAttributesToSVGElement 로 루트에 fill="currentColor" 를 다시 심는다.
//       (지우고 안 심으면 검정 고정이 아니라 '색을 못 바꾸는 검정'이 된다)
//  2) potrace 는 width/height 를 pt 로 쓴다. 브라우저는 px 로 읽어 20% 크게 그린다.
//     → removeDimensions 로 치운다. 그럼 크기 정보는 viewBox 만 남는다.
//     svgo 3.x 에서는 removeViewBox 가 preset-default 에 들어 있어서 반드시 꺼야 했지만,
//     4.x 는 preset-default 에서 빠졌다. override 로 끄려 하면 경고만 나고 아무 일도 안 한다
//     (2026-09-01 4.1.0 실측). 그래서 여기엔 안 쓰고, 대신 게이트 ③ 이 viewBox 생존을
//     매번 확인한다 — 나중에 preset 이 또 바뀌면 설정이 아니라 검사가 잡는다.
export default {
  multipass: true,
  js2svg: { pretty: false },
  plugins: [
    { name: 'preset-default',
      params: { overrides: {
        convertPathData: { floatPrecision: 0, transformPrecision: 0 },
        cleanupNumericValues: { floatPrecision: 0 },
      } } },
    'removeDimensions',
    'removeMetadata',
    { name: 'addAttributesToSVGElement', params: { attributes: [{ fill: 'currentColor' }] } },
  ],
}
