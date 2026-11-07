# Architecture

`@trysac/image-annotate-web` implements a framework-free annotation engine.

## Design

- **In-memory Document State**: Pure immutable data representation for shapes (`box`, `polygon`, `point`). Coordinates are stored strictly in image pixel space.
- **Clamping & Normalization**: All coordinate inputs are clamped to image boundaries `[0, width] x [0, height]`. Inverted boxes with negative width or height are flipped into canonical `(x, y, w, h)` form.
- **History Tracking**: Add, update, and remove actions push invertible mutation records onto an undo/redo stack capped at `maxHistory`.
- **Spatial Queries**: Ray-casting even-odd algorithm for polygons, axis-aligned bounding check for boxes, and Euclidean distance tests for points.
- **View Transforms**: Coordinate translations between viewport and image coordinate systems with zoom and pan.
- **Export/Import**: Full bidirectional compatibility with the COCO object detection format and standard YOLO segmentation/box formats.
