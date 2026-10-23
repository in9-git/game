# Janggi engine — Fairy-Stockfish (GPL-3.0)

The three engine files listed below are **not** covered by the repository's MIT
License. They are unmodified copies of the files of the same name in the npm package
[`fairy-stockfish-nnue.wasm`](https://www.npmjs.com/package/fairy-stockfish-nnue.wasm)
version **1.1.11**, licensed under the **GNU General Public License v3.0**
(full text: [`COPYING`](COPYING)).

| File | sha256 |
|---|---|
| `stockfish.js` | `86f07a252c46e02760562d8bf6d32beb5f4fc5746c5f8233566a7ca3db6a8af4` |
| `stockfish.wasm` | `91f78f226169ae0e08be3854e0b4de8f5461844d38f08eaae8e3f8ee0833831d` |
| `stockfish.worker.js` | `067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573` |

- Copyright: Fabian Fichter and the Fairy-Stockfish contributors; derived from
  Stockfish, copyright the Stockfish developers.
- Corresponding source:
  - WASM build: https://github.com/fairy-stockfish/fairy-stockfish.wasm (1.1.11)
  - Engine: https://github.com/fairy-stockfish/Fairy-Stockfish

The janggi page (`../index.html`, MIT) loads this unmodified engine at runtime
from these separate files and talks to it only through UCI text commands
(`postMessage` / `addMessageListener`); the engine runs its search in Web Worker
threads (`stockfish.worker.js`).
