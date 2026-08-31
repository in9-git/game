#!/usr/bin/env bash
# 「말없는 자연 관찰」 생물 에셋 빌드 — assets/lifeform/src/ → assets/lifeform/
#
#   원본은 src/ 에 그대로 두고, 파생물만 이 스크립트로 재생성한다.
#   파생값만 남기지 않는다 = 원본에서 언제든 다시 만들 수 있어야 한다.
#   필요: node(npx), python3 + Pillow.   실행: bash tools/build-lifeform.sh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -c 'import PIL' 2>/dev/null || { echo "Pillow 필요: python3 -m pip install --user Pillow"; exit 1; }

echo "▸ 실루엣 (svgo)"
npx --yes svgo@4.1.0 --config tools/svgo.config.mjs -f assets/lifeform/src -o assets/lifeform

echo "▸ 도판 (crop → resize → encode)"
python3 - <<'PY'
from PIL import Image, ImageFilter
import numpy as np, os

# 크롭 상자는 원본 스캔 좌표. 잉크 경계에서 자동 산출한 값을 상수로 고정했다
# (매번 자동 검출하면 스캔이 바뀔 때 조용히 다른 그림이 나온다).
FLIGHT = dict(src='assets/lifeform/src/plate-flight-1905-page.jpg',
              dst='assets/lifeform/plate-flight-1905.jpg',
              box=(124, 1150, 1562, 2140), width=1200, blur=0.9, q=76)
SKEL   = dict(src='assets/lifeform/src/plate-skeleton-1910-page.jpg',
              dst='assets/lifeform/plate-skeleton-1910.png',
              box=(266, 453, 1569, 2672), width=880)

f = FLIGHT
im = Image.open(f['src']).crop(f['box']).convert('L')
im = im.resize((f['width'], round(im.height * f['width'] / im.width)), Image.LANCZOS)
im = im.filter(ImageFilter.GaussianBlur(f['blur']))   # 종이 그레인 = JPEG 의 적
im.convert('RGB').save(f['dst'], 'JPEG', quality=f['q'], optimize=True, progressive=True)
print(f"  {f['dst']}  {im.width}x{im.height}  {os.path.getsize(f['dst'])//1024} KB")

s = SKEL
im = Image.open(s['src']).crop(s['box']).convert('L')
im = im.resize((s['width'], round(im.height * s['width'] / im.width)), Image.LANCZOS)
a = np.asarray(im).astype(float)
# 선화 → 잉크만 알파로. 종이는 투명해지고, 잉크 색은 그리는 쪽이 정한다.
paper, ink = np.percentile(a, 88), np.percentile(a, 2)
alpha = np.clip((paper - a) / (paper - ink), 0, 1) ** 1.6      # 1.6 = 종이 잡티 제거
rgba = np.zeros((*alpha.shape, 4), 'uint8'); rgba[..., 3] = (alpha * 255).astype('uint8')
Image.fromarray(rgba, 'RGBA').quantize(colors=64, method=Image.FASTOCTREE).save(s['dst'], optimize=True)
print(f"  {s['dst']}  {rgba.shape[1]}x{rgba.shape[0]}  {os.path.getsize(s['dst'])//1024} KB")
PY

echo "▸ 검사"
node tools/check-assets.mjs
