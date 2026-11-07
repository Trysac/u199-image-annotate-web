# Security Policy

## Threat Model

The library handles user-provided data (JSON imports) and geometric inputs. It is hardened against common pitfalls in canvas/annotation tooling.

### Defended

- **Denial of Service**: `importCoco` restricts input length (default 5,000,000 chars) to prevent heap exhaustion. Internal object creation is limited by `maxShapes` (default 10,000).
- **Memory Exhaustion**: The undo/redo stack is bounded by `maxHistory` (default 200).
- **Input Validation**: All coordinate inputs are clamped to `[0, width]` and `[0, height]`. Geometric shapes are validated (e.g., zero-area boxes, polygons with <3 points) and invalid payloads trigger `AnnotateError` rather than crashing.

### Not Defended

- **Arbitrary Code Execution**: As the library is a pure logic implementation, it relies on the host environment's security. It assumes the host application treats outputs (like exported JSON) as untrusted if passed to other systems.
