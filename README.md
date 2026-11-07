# @trysac/image-annotate-web

[![CI](https://github.com/Trysac/u199-image-annotate-web/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u199-image-annotate-web/actions/workflows/ci.yml)

Browser and Node.js core library for image annotation. Provides bounding boxes, polygons, and point shapes with automatic coordinate clamping, full undo/redo history, spatial hit testing, viewport coordinate transforms, and standard COCO and YOLO export/import formats.

## The Problem

Labelling a few hundred images for a vision model does not justify deploying a heavy labelling platform, yet hand-rolled canvas tools often get coordinate math, undo stacks, and export formats subtly wrong, which silently corrupts training data. This library provides a tested, framework-free annotation engine for any canvas or SVG front end.

## Installation

```bash
npm install @trysac/image-annotate-web
```

## Usage

```typescript
import { createAnnotator, exportCoco } from '@trysac/image-annotate-web';

const ann = createAnnotator({ width: 800, height: 600, labels: ['dog', 'cat'] });
const id = ann.add({ kind: 'box', x: 50, y: 50, w: 200, h: 150, label: 'dog' });
ann.update(id, { x: 60 });
ann.undo();
const coco = exportCoco(ann.doc(), { fileName: 'sample.jpg' });
```

## Public API Summary

- **Entry**: `createAnnotator(opts)` creates a controller. Options: `width`, `height`, `labels`, `maxShapes` (default 10,000), `maxHistory` (default 200).
- **Controller**: `add`, `update`, `remove`, `undo`, `redo`, `hitTest`, `shapes`, `doc`.
- **Transforms**: `viewToImage`, `imageToView`.
- **IO**: `exportCoco`, `exportYolo`, `importCoco`.
- **Errors**: `AnnotateError` with codes: `UNKNOWN_LABEL`, `INVALID_SHAPE`, `LIMIT_EXCEEDED`, `NOT_FOUND`, `INVALID_VIEW`, `INVALID_JSON`, `INPUT_TOO_LARGE`.

## Why not CVAT or Label Studio?

Those are server-based labelling platforms. This is a tiny, embeddable, framework-free TypeScript library that focuses solely on the mathematical core (clamping, transforms, and export) so you can build your own UI without dealing with state corruption.

See [docs/SECURITY.md](docs/SECURITY.md) for vulnerability boundaries.
