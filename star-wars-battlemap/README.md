# Star Wars Battlemap

Realtime starship battlemap widget (prototype).

## Features (Phase 1)
* Large pannable, zoomable map (4k x 3k logical px)
* Configurable ships via `config/ships.json` (id, name, icon class, position, HP, range bands)
* Drag to move ships (server authoritative broadcast with Socket.IO)
* Select ship to display range bands (5 bands — customize per ship)
* Double‑click another ship to perform an attack (placeholder 1d10-3 damage)
* Modal shows attack roll & damage; laser animation draws shot on hit

## Run
```
npm install
npm start
```
Visit: http://localhost:3010

## Docker
```
docker build -t battlemap .
docker run -p 3010:3010 battlemap
```

## Next Steps / Roadmap
* Persist state (file / database)
* Auth / GM controls vs viewer mode
* Better damage & dice system (Genesys / custom rules)
* Fog of war / sectors
* Ship icons (SVG/PNG) rather than colored blocks
* Undo / movement history
* Multi-room support (namespaces)
* Tests (state transitions, attack logic isolation)

---
Prototype – expect changes. Improve modularity before expanding.
