import { describe, expect, it } from "vitest";
import {
  AnnotateError,
  createAnnotator,
  exportCoco,
  exportYolo,
  imageToView,
  importCoco,
  viewToImage,
} from "../src/index.js";

describe("image-annotate-web acceptance criteria", () => {
  it("creates an annotator, adds clamped box, and normalizes negative box dimensions", () => {
    const ann = createAnnotator({ width: 100, height: 50, labels: ["cat", "dog"] });
    const id = ann.add({ kind: "box", x: 90, y: 40, w: 20, h: 20, label: "cat" });
    expect(id).toBe("a1");
    expect(ann.shapes()[0]).toEqual({
      id: "a1",
      kind: "box",
      x: 90,
      y: 40,
      w: 10,
      h: 10,
      label: "cat",
    });

    const id2 = ann.add({ kind: "box", x: 20, y: 10, w: -10, h: 10, label: "dog" });
    expect(id2).toBe("a2");
    expect(ann.shapes()[1]).toEqual({
      id: "a2",
      kind: "box",
      x: 10,
      y: 10,
      w: 10,
      h: 10,
      label: "dog",
    });
  });

  it("validates labels, points, NaN coordinates, and shape limits", () => {
    const ann = createAnnotator({ width: 100, height: 100, labels: ["cat"], maxShapes: 2 });

    expect(() => {
      ann.add({ kind: "box", x: 10, y: 10, w: 10, h: 10, label: "cow" });
    }).toThrowError(AnnotateError);
    try {
      ann.add({ kind: "box", x: 10, y: 10, w: 10, h: 10, label: "cow" });
    } catch (e) {
      expect((e as AnnotateError).code).toBe("UNKNOWN_LABEL");
    }

    expect(() => {
      ann.add({
        kind: "polygon",
        points: [
          [0, 0],
          [10, 10],
        ],
        label: "cat",
      });
    }).toThrowError(AnnotateError);
    try {
      ann.add({
        kind: "polygon",
        points: [
          [0, 0],
          [10, 10],
        ],
        label: "cat",
      });
    } catch (e) {
      expect((e as AnnotateError).code).toBe("INVALID_SHAPE");
    }

    expect(() => {
      ann.add({ kind: "box", x: Number.NaN, y: 10, w: 10, h: 10, label: "cat" });
    }).toThrowError(AnnotateError);
    try {
      ann.add({ kind: "box", x: Number.NaN, y: 10, w: 10, h: 10, label: "cat" });
    } catch (e) {
      expect((e as AnnotateError).code).toBe("INVALID_SHAPE");
    }

    ann.add({ kind: "box", x: 0, y: 0, w: 10, h: 10, label: "cat" });
    ann.add({ kind: "box", x: 20, y: 20, w: 10, h: 10, label: "cat" });

    expect(() => {
      ann.add({ kind: "box", x: 40, y: 40, w: 10, h: 10, label: "cat" });
    }).toThrowError(AnnotateError);
    try {
      ann.add({ kind: "box", x: 40, y: 40, w: 10, h: 10, label: "cat" });
    } catch (e) {
      expect((e as AnnotateError).code).toBe("LIMIT_EXCEEDED");
    }
  });

  it("handles undo, redo, stack resets on new mutations, and maxHistory", () => {
    const ann = createAnnotator({ width: 100, height: 100, labels: ["cat"], maxHistory: 2 });
    const id = ann.add({ kind: "box", x: 10, y: 10, w: 20, h: 20, label: "cat" });
    ann.update(id, { x: 5 });
    const first = ann.shapes()[0];
    expect(first?.kind === "box" ? first.x : undefined).toBe(5);

    expect(ann.undo()).toBe(true);
    const undone1 = ann.shapes()[0];
    expect(undone1?.kind === "box" ? undone1.x : undefined).toBe(10);

    expect(ann.redo()).toBe(true);
    const redone = ann.shapes()[0];
    expect(redone?.kind === "box" ? redone.x : undefined).toBe(5);

    expect(ann.undo()).toBe(true);
    const undone2 = ann.shapes()[0];
    expect(undone2?.kind === "box" ? undone2.x : undefined).toBe(10);

    // New mutation resets redo stack
    ann.add({ kind: "point", x: 30, y: 30, label: "cat" });
    expect(ann.redo()).toBe(false);

    // Test maxHistory 2: third undo returns false
    expect(ann.undo()).toBe(true);
    expect(ann.undo()).toBe(true);
    expect(ann.undo()).toBe(false);
  });

  it("implements hit testing for overlapping boxes, polygons, and points with tolerance", () => {
    const ann = createAnnotator({ width: 100, height: 100, labels: ["box", "poly", "pt"] });
    const id1 = ann.add({ kind: "box", x: 0, y: 0, w: 20, h: 20, label: "box" });
    const id2 = ann.add({ kind: "box", x: 0, y: 0, w: 10, h: 10, label: "box" });

    // Overlapping boxes: return last added
    expect(ann.hitTest({ x: 5, y: 5 })).toBe(id2);
    expect(ann.hitTest({ x: 15, y: 15 })).toBe(id1);

    // Polygon ray casting hit test
    const polyId = ann.add({
      kind: "polygon",
      points: [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      label: "poly",
    });
    expect(ann.hitTest({ x: 2, y: 2 })).toBe(polyId);
    expect(ann.hitTest({ x: 8, y: 8 })).toBe(id2);

    // Point shape hit testing with tolerance
    const ptId = ann.add({ kind: "point", x: 3, y: 3, label: "pt" });
    expect(ann.hitTest({ x: 5, y: 3 }, 2)).toBe(ptId);
    expect(ann.hitTest({ x: 5, y: 3 }, 1)).not.toBe(ptId);
  });

  it("handles viewToImage and imageToView transforms", () => {
    const pt = viewToImage({ x: 150, y: 100 }, { zoom: 2, panX: 50, panY: 0 });
    expect(pt).toEqual({ x: 50, y: 50 });
    const viewPt = imageToView(pt, { zoom: 2, panX: 50, panY: 0 });
    expect(viewPt).toEqual({ x: 150, y: 100 });

    expect(() => {
      viewToImage({ x: 0, y: 0 }, { zoom: 0, panX: 0, panY: 0 });
    }).toThrowError(AnnotateError);
    try {
      viewToImage({ x: 0, y: 0 }, { zoom: 0, panX: 0, panY: 0 });
    } catch (e) {
      expect((e as AnnotateError).code).toBe("INVALID_VIEW");
    }
  });

  it("exports COCO format accurately for boxes and polygons", () => {
    const ann = createAnnotator({ width: 100, height: 50, labels: ["cat", "dog"] });
    ann.add({ kind: "box", x: 10, y: 10, w: 20, h: 10, label: "cat" });
    ann.add({
      kind: "polygon",
      points: [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      label: "dog",
    });

    const json = exportCoco(ann.doc(), { fileName: "a.jpg" });
    const parsed = JSON.parse(json);

    expect(parsed.categories).toEqual([
      { id: 1, name: "cat" },
      { id: 2, name: "dog" },
    ]);
    expect(parsed.annotations[0]).toEqual({
      id: 1,
      image_id: 1,
      category_id: 1,
      bbox: [10, 10, 20, 10],
      area: 200,
      iscrowd: 0,
    });
    expect(parsed.annotations[1]).toEqual({
      id: 2,
      image_id: 1,
      category_id: 2,
      bbox: [0, 0, 10, 10],
      area: 50,
      iscrowd: 0,
      segmentation: [[0, 0, 10, 0, 0, 10]],
    });
  });

  it("exports YOLO format with normalized coordinates and counts skipped points", () => {
    const ann = createAnnotator({ width: 100, height: 50, labels: ["cat", "dog"] });
    ann.add({ kind: "box", x: 10, y: 10, w: 20, h: 10, label: "cat" });
    ann.add({
      kind: "polygon",
      points: [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      label: "dog",
    });
    ann.add({ kind: "point", x: 5, y: 5, label: "cat" });

    const yolo = exportYolo(ann.doc());
    const lines = yolo.text.split("\n");
    expect(lines[0]).toBe("0 0.200000 0.300000 0.200000 0.200000");
    expect(lines[1]).toBe("1 0.000000 0.000000 0.100000 0.000000 0.000000 0.200000");
    expect(yolo.skipped).toBe(1);
  });

  it("imports COCO format and enforces limits and validation", () => {
    const ann = createAnnotator({ width: 100, height: 50, labels: ["cat", "dog"] });
    ann.add({ kind: "box", x: 10, y: 10, w: 20, h: 10, label: "cat" });
    ann.add({
      kind: "polygon",
      points: [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      label: "dog",
    });

    const cocoStr = exportCoco(ann.doc(), { fileName: "test.png" });
    const imported = importCoco(cocoStr);
    expect(imported.shapes.length).toBe(2);
    expect(imported.shapes[0]).toEqual(ann.shapes()[0]);
    expect(imported.shapes[1]).toEqual(ann.shapes()[1]);

    expect(() => importCoco("not json")).toThrowError(AnnotateError);
    try {
      importCoco("not json");
    } catch (e) {
      expect((e as AnnotateError).code).toBe("INVALID_JSON");
    }

    const huge = `${" ".repeat(50)}{ "valid": false }`;
    expect(() => importCoco(huge, { maxLength: 20 })).toThrowError(AnnotateError);
    try {
      importCoco(huge, { maxLength: 20 });
    } catch (e) {
      expect((e as AnnotateError).code).toBe("INPUT_TOO_LARGE");
    }
  });

  it("covers remove, undoing removal, boundary clamping, and 1x1 image", () => {
    const ann = createAnnotator({ width: 1, height: 1, labels: ["tag"] });
    const id = ann.add({ kind: "box", x: -5, y: -5, w: 10, h: 10, label: "tag" });
    expect(ann.shapes()[0]).toEqual({
      id,
      kind: "box",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      label: "tag",
    });

    ann.remove(id);
    expect(ann.shapes().length).toBe(0);
    expect(ann.undo()).toBe(true);
    expect(ann.shapes().length).toBe(1);
    expect(ann.shapes()[0]?.id).toBe(id);
  });

  it("throws for invalid options, missing shapes, or bad updates", () => {
    expect(() => createAnnotator({ width: 0, height: 10, labels: ["a"] })).toThrowError(
      AnnotateError,
    );
    expect(() => createAnnotator({ width: 10, height: 10, labels: [] })).toThrowError(
      AnnotateError,
    );
    expect(() => createAnnotator({ width: 10, height: 10, labels: ["a", "a"] })).toThrowError(
      AnnotateError,
    );

    const ann = createAnnotator({ width: 50, height: 50, labels: ["a"] });
    expect(() => ann.remove("unknown")).toThrowError(AnnotateError);
    expect(() => ann.update("unknown", { x: 10 })).toThrowError(AnnotateError);
  });
});
