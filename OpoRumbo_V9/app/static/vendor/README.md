# Three.js local

Three.js 0.160.0 (ES module), distributed under MIT. This is a pinned local
dependency; the app does not contact a CDN to render its companion.

- Source: https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
- License: `THREE-LICENSE.txt`
- SHA-256 (original downloaded bytes): `76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495`

The isolated renderer imports this module; the study application never imports it.
Replace the model adapter in `../companion-model.js` to integrate GLB assets later.
Keep its `root`, `update(time, reaction, animate)`, and `dispose()` contract.
