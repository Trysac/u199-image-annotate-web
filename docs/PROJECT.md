# Project record: image-annotate-web

## Objective

To provide a robust, framework-free core library for 2D image annotation that handles coordinate system logic, history management, and standard data interchange (COCO/YOLO) for developers building custom annotation front ends.

## Scope

- Annotation state management: Boxes, polygons, and point entities.
- Coordinate validation, clamping, and normalization to image pixel space.
- History: Undo/redo stack for mutation tracking.
- Spatial analysis: Hit testing for interaction logic.
- Math: Viewport-to-image coordinate transformations.
- IO: Import/Export routines for COCO and YOLO formats.

## Out of Scope

- UI/UX: The library provides no rendering logic, DOM event listeners, or visual components.
- Data format extras: Segmentation masks (pixel-wise), RLE compression, keypoints, or multi-image project management.
- AI Integration: The library does not perform auto-labelling, model-assisted annotation, or pre-processing.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 852220 / 17554 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.1971 | factory ledger |

## Factory run u199 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4840 | 12780 | 0 | 0 | 0.0258 |
| fix-1 | gemini-3.8-flash | no | 75480 | 2360 | 0 | 542355 | 0.1061 |
| fix-2 | gemini-3.8-flash | no | 23652 | 465 | 0 | 51098 | 0.0233 |
| fix-3 | gemini-3.8-flash | no | 35535 | 263 | 0 | 103463 | 0.0354 |
| docs | gemini-3.1-flash-lite | no | 15797 | 1686 | 0 | 0 | 0.0065 |

Total: $0.1971. Prices: Anthropic list prices.
