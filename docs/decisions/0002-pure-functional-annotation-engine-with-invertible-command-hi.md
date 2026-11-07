# Pure Functional Annotation Engine with Invertible Command History

Status: accepted (generated, pending human review)

## Context

Interactive annotation in web applications requires high responsiveness, exact coordinate transformations between screen viewports and images, robust undo/redo capabilities, and standardized export without requiring heavy labelling servers or DOM dependencies.

## Decision

Implement the core model as a zero-dependency TypeScript library with non-reuse monotonic IDs, bounded invertible history stack, pixel-space coordinate clamping, ray-casting hit-testing, and COCO/YOLO format encoders/decoders.

## Consequences

Allows seamless embedding in any frontend framework, WebGL/Canvas renderer, or headless Node.js batch processing pipeline.
