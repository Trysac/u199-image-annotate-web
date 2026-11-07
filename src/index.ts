/**
 * Core image annotation engine for browsers and Node.js.
 *
 * Provides coordinate clamping, undo/redo history, spatial hit testing,
 * pan/zoom coordinate transforms, and standard COCO and YOLO export/import.
 */

/** Error codes produced by {@link AnnotateError}. */
export type AnnotateErrorCode =
  | "UNKNOWN_LABEL"
  | "INVALID_SHAPE"
  | "LIMIT_EXCEEDED"
  | "NOT_FOUND"
  | "INVALID_VIEW"
  | "INVALID_JSON"
  | "INPUT_TOO_LARGE";

/** Base error class for all annotation errors. */
export class AnnotateError extends Error {
  readonly code: AnnotateErrorCode;

  constructor(code: AnnotateErrorCode, message: string) {
    super(message);
    this.name = "AnnotateError";
    this.code = code;
    Object.setPrototypeOf(this, AnnotateError.prototype);
  }
}

/** 2D point representation in pixel coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Viewport pan and zoom parameters. */
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

/** Input shape data before an ID is assigned. */
export type ShapeInput =
  | { kind: "box"; x: number; y: number; w: number; h: number; label: string }
  | { kind: "polygon"; points: [number, number][]; label: string }
  | { kind: "point"; x: number; y: number; label: string };

/** Shape with assigned identifier and normalized coordinates. */
export type Shape =
  | { id: string; kind: "box"; x: number; y: number; w: number; h: number; label: string }
  | { id: string; kind: "polygon"; points: [number, number][]; label: string }
  | { id: string; kind: "point"; x: number; y: number; label: string };

/** Complete document representation with image dimensions, labels, and shapes. */
export interface AnnotationDoc {
  width: number;
  height: number;
  labels: string[];
  shapes: Shape[];
}

/** Configuration options for {@link createAnnotator}. */
export interface AnnotatorOptions {
  width: number;
  height: number;
  labels: string[];
  maxShapes?: number;
  maxHistory?: number;
}

/** Public interactive annotator controller interface. */
export interface Annotator {
  add(s: ShapeInput): string;
  update(id: string, patch: Partial<ShapeInput>): void;
  remove(id: string): void;
  undo(): boolean;
  redo(): boolean;
  hitTest(p: Point, tolerance?: number): string | null;
  shapes(): Shape[];
  doc(): AnnotationDoc;
}

interface HistoryEntry {
  apply: () => void;
  inverse: () => void;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function validateLabel(label: unknown, allowedLabels: Set<string>): string {
  if (typeof label !== "string") {
    throw new AnnotateError("INVALID_SHAPE", "Shape label must be a string");
  }
  if (!allowedLabels.has(label)) {
    throw new AnnotateError("UNKNOWN_LABEL", `Unknown label: ${label.slice(0, 50)}`);
  }
  return label;
}

function normalizeAndValidateShapeInput(
  input: ShapeInput,
  width: number,
  height: number,
  allowedLabels: Set<string>,
): ShapeInput {
  if (!input || typeof input !== "object" || typeof input.kind !== "string") {
    throw new AnnotateError("INVALID_SHAPE", "Invalid shape payload");
  }

  const label = validateLabel(input.label, allowedLabels);

  if (input.kind === "box") {
    if (
      !isFiniteNumber(input.x) ||
      !isFiniteNumber(input.y) ||
      !isFiniteNumber(input.w) ||
      !isFiniteNumber(input.h)
    ) {
      throw new AnnotateError(
        "INVALID_SHAPE",
        "Box coordinates and dimensions must be finite numbers",
      );
    }

    let x = input.x;
    let y = input.y;
    let w = input.w;
    let h = input.h;

    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }

    const left = clamp(x, 0, width);
    const top = clamp(y, 0, height);
    const right = clamp(x + w, 0, width);
    const bottom = clamp(y + h, 0, height);

    const finalW = Math.max(0, right - left);
    const finalH = Math.max(0, bottom - top);

    if (finalW <= 0 || finalH <= 0) {
      throw new AnnotateError("INVALID_SHAPE", "Zero-area boxes are not permitted");
    }

    return {
      kind: "box",
      x: left,
      y: top,
      w: finalW,
      h: finalH,
      label,
    };
  }

  if (input.kind === "polygon") {
    if (!Array.isArray(input.points)) {
      throw new AnnotateError("INVALID_SHAPE", "Polygon points must be an array");
    }
    if (input.points.length < 3 || input.points.length > 1000) {
      throw new AnnotateError("INVALID_SHAPE", "Polygon must contain between 3 and 1000 points");
    }

    const clampedPoints: [number, number][] = [];
    for (const pt of input.points) {
      if (!Array.isArray(pt) || pt.length < 2 || !isFiniteNumber(pt[0]) || !isFiniteNumber(pt[1])) {
        throw new AnnotateError("INVALID_SHAPE", "Polygon points must have finite coordinates");
      }
      clampedPoints.push([clamp(pt[0], 0, width), clamp(pt[1], 0, height)]);
    }

    return {
      kind: "polygon",
      points: clampedPoints,
      label,
    };
  }

  if (input.kind === "point") {
    if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) {
      throw new AnnotateError("INVALID_SHAPE", "Point coordinates must be finite numbers");
    }

    return {
      kind: "point",
      x: clamp(input.x, 0, width),
      y: clamp(input.y, 0, height),
      label,
    };
  }

  throw new AnnotateError(
    "INVALID_SHAPE",
    `Unknown shape kind: ${(input as { kind: string }).kind}`,
  );
}

function cloneShape(s: Shape): Shape {
  if (s.kind === "box") {
    return { id: s.id, kind: "box", x: s.x, y: s.y, w: s.w, h: s.h, label: s.label };
  }
  if (s.kind === "polygon") {
    return { id: s.id, kind: "polygon", points: s.points.map((p) => [p[0], p[1]]), label: s.label };
  }
  return { id: s.id, kind: "point", x: s.x, y: s.y, label: s.label };
}

function pointInPolygon(px: number, py: number, points: [number, number][]): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const p1 = points[i];
    const p2 = points[j];
    if (!p1 || !p2) {
      continue;
    }
    const xi = p1[0];
    const yi = p1[1];
    const xj = p2[0];
    const yj = p2[1];

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi === 0 ? 1e-12 : yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Creates an interactive annotation controller.
 *
 * @param opts - Document dimensions and allowed labels.
 * @returns The annotator instance.
 */
export function createAnnotator(opts: AnnotatorOptions): Annotator {
  if (
    !opts ||
    !isFiniteNumber(opts.width) ||
    !isFiniteNumber(opts.height) ||
    opts.width <= 0 ||
    opts.height <= 0
  ) {
    throw new AnnotateError(
      "INVALID_SHAPE",
      "Annotator dimensions must be positive finite numbers",
    );
  }

  if (!Array.isArray(opts.labels) || opts.labels.length === 0 || opts.labels.length > 100) {
    throw new AnnotateError("LIMIT_EXCEEDED", "Labels must contain between 1 and 100 items");
  }

  const seenLabels = new Set<string>();
  for (const l of opts.labels) {
    if (typeof l !== "string" || l.length < 1 || l.length > 64) {
      throw new AnnotateError("INVALID_SHAPE", "Labels must be strings of 1-64 characters");
    }
    if (seenLabels.has(l)) {
      throw new AnnotateError("INVALID_SHAPE", `Duplicate label: ${l}`);
    }
    seenLabels.add(l);
  }

  const width = opts.width;
  const height = opts.height;
  const labels = [...opts.labels];
  const allowedLabels = new Set(labels);
  const maxShapes = opts.maxShapes ?? 10_000;
  const maxHistory = opts.maxHistory ?? 200;

  let shapeList: Shape[] = [];
  let nextIdCounter = 1;

  let history: HistoryEntry[] = [];
  let historyIndex = 0;

  function pushMutation(entry: HistoryEntry): void {
    history = history.slice(0, historyIndex);
    history.push(entry);
    if (history.length > maxHistory) {
      history.shift();
    } else {
      historyIndex++;
    }
    if (historyIndex > history.length) {
      historyIndex = history.length;
    }
  }

  return {
    add(s: ShapeInput): string {
      if (shapeList.length >= maxShapes) {
        throw new AnnotateError("LIMIT_EXCEEDED", `Maximum shape limit (${maxShapes}) reached`);
      }

      const norm = normalizeAndValidateShapeInput(s, width, height, allowedLabels);
      const id = `a${nextIdCounter++}`;
      const newShape: Shape =
        norm.kind === "polygon"
          ? { id, kind: "polygon", points: norm.points, label: norm.label }
          : norm.kind === "box"
            ? { id, kind: "box", x: norm.x, y: norm.y, w: norm.w, h: norm.h, label: norm.label }
            : { id, kind: "point", x: norm.x, y: norm.y, label: norm.label };

      const apply = () => {
        shapeList.push(cloneShape(newShape));
      };
      const inverse = () => {
        shapeList = shapeList.filter((item) => item.id !== id);
      };

      apply();
      pushMutation({ apply, inverse });
      return id;
    },

    update(id: string, patch: Partial<ShapeInput>): void {
      const idx = shapeList.findIndex((item) => item.id === id);
      const current = shapeList[idx];
      if (idx === -1 || !current) {
        throw new AnnotateError("NOT_FOUND", `Shape ${id} not found`);
      }
      const mergedInput: ShapeInput = {
        ...current,
        ...patch,
      } as ShapeInput;

      const norm = normalizeAndValidateShapeInput(mergedInput, width, height, allowedLabels);
      const updatedShape: Shape =
        norm.kind === "polygon"
          ? { id, kind: "polygon", points: norm.points, label: norm.label }
          : norm.kind === "box"
            ? { id, kind: "box", x: norm.x, y: norm.y, w: norm.w, h: norm.h, label: norm.label }
            : { id, kind: "point", x: norm.x, y: norm.y, label: norm.label };

      const prevShape = cloneShape(current);
      const apply = () => {
        const i = shapeList.findIndex((item) => item.id === id);
        if (i !== -1) {
          shapeList[i] = cloneShape(updatedShape);
        }
      };
      const inverse = () => {
        const i = shapeList.findIndex((item) => item.id === id);
        if (i !== -1) {
          shapeList[i] = cloneShape(prevShape);
        }
      };

      apply();
      pushMutation({ apply, inverse });
    },

    remove(id: string): void {
      const idx = shapeList.findIndex((item) => item.id === id);
      const existing = shapeList[idx];
      if (idx === -1 || !existing) {
        throw new AnnotateError("NOT_FOUND", `Shape ${id} not found`);
      }
      const savedShape = cloneShape(existing);
      const savedIdx = idx;

      const apply = () => {
        shapeList = shapeList.filter((item) => item.id !== id);
      };
      const inverse = () => {
        shapeList.splice(savedIdx, 0, cloneShape(savedShape));
      };

      apply();
      pushMutation({ apply, inverse });
    },

    undo(): boolean {
      if (historyIndex <= 0) {
        return false;
      }
      historyIndex--;
      const entry = history[historyIndex];
      if (!entry) {
        return false;
      }
      entry.inverse();
      return true;
    },

    redo(): boolean {
      if (historyIndex >= history.length) {
        return false;
      }
      const entry = history[historyIndex];
      if (!entry) {
        return false;
      }
      entry.apply();
      historyIndex++;
      return true;
    },

    hitTest(p: Point, tolerance = 4): string | null {
      if (
        !p ||
        !isFiniteNumber(p.x) ||
        !isFiniteNumber(p.y) ||
        !isFiniteNumber(tolerance) ||
        tolerance < 0
      ) {
        return null;
      }
      // Scan from last to first (topmost to bottommost)
      for (let i = shapeList.length - 1; i >= 0; i--) {
        const s = shapeList[i];
        if (!s) {
          continue;
        }
        if (s.kind === "box") {
          if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
            return s.id;
          }
        } else if (s.kind === "polygon") {
          if (pointInPolygon(p.x, p.y, s.points)) {
            return s.id;
          }
        } else if (s.kind === "point") {
          const dx = p.x - s.x;
          const dy = p.y - s.y;
          if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
            return s.id;
          }
        }
      }
      return null;
    },

    shapes(): Shape[] {
      return shapeList.map(cloneShape);
    },

    doc(): AnnotationDoc {
      return {
        width,
        height,
        labels: [...labels],
        shapes: shapeList.map(cloneShape),
      };
    },
  };
}

/**
 * Converts viewport coordinates to image pixel coordinates.
 *
 * @param p - Viewport point.
 * @param v - View transformation (pan and zoom).
 * @returns Image coordinates.
 */
export function viewToImage(p: Point, v: View): Point {
  if (
    !p ||
    !v ||
    !isFiniteNumber(p.x) ||
    !isFiniteNumber(p.y) ||
    !isFiniteNumber(v.panX) ||
    !isFiniteNumber(v.panY) ||
    !isFiniteNumber(v.zoom) ||
    v.zoom === 0
  ) {
    throw new AnnotateError("INVALID_VIEW", "View zoom must be a non-zero finite number");
  }
  return {
    x: (p.x - v.panX) / v.zoom,
    y: (p.y - v.panY) / v.zoom,
  };
}

/**
 * Converts image pixel coordinates to viewport coordinates.
 *
 * @param p - Image point.
 * @param v - View transformation (pan and zoom).
 * @returns Viewport coordinates.
 */
export function imageToView(p: Point, v: View): Point {
  if (
    !p ||
    !v ||
    !isFiniteNumber(p.x) ||
    !isFiniteNumber(p.y) ||
    !isFiniteNumber(v.panX) ||
    !isFiniteNumber(v.panY) ||
    !isFiniteNumber(v.zoom) ||
    v.zoom === 0
  ) {
    throw new AnnotateError("INVALID_VIEW", "View zoom must be a non-zero finite number");
  }
  return {
    x: p.x * v.zoom + v.panX,
    y: p.y * v.zoom + v.panY,
  };
}

/**
 * Computes polygon area using the Shoelace formula.
 */
function polygonArea(points: [number, number][]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const pt1 = points[i];
    const pt2 = points[(i + 1) % n];
    if (!pt1 || !pt2) {
      continue;
    }
    const [x1, y1] = pt1;
    const [x2, y2] = pt2;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Exports an {@link AnnotationDoc} to COCO object detection JSON.
 * Point shapes are omitted since COCO keypoints are not supported.
 *
 * @param doc - Annotation document.
 * @param meta - Image metadata including file name and optional imageId.
 * @returns JSON string representing the COCO format.
 */
export function exportCoco(
  doc: AnnotationDoc,
  meta: { fileName: string; imageId?: number },
): string {
  if (!doc || !meta || typeof meta.fileName !== "string" || meta.fileName.length === 0) {
    throw new AnnotateError("INVALID_JSON", "Invalid exportCoco parameters");
  }

  const imageId = meta.imageId ?? 1;
  const categories = doc.labels.map((name, index) => ({
    id: index + 1,
    name,
  }));

  const labelToId = new Map<string, number>();
  for (const cat of categories) {
    labelToId.set(cat.name, cat.id);
  }

  let annotationId = 1;
  const annotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number];
    area: number;
    iscrowd: number;
    segmentation?: number[][];
  }> = [];

  for (const shape of doc.shapes) {
    const categoryId = labelToId.get(shape.label);
    if (categoryId === undefined) {
      continue;
    }

    if (shape.kind === "box") {
      annotations.push({
        id: annotationId++,
        image_id: imageId,
        category_id: categoryId,
        bbox: [shape.x, shape.y, shape.w, shape.h],
        area: shape.w * shape.h,
        iscrowd: 0,
      });
    } else if (shape.kind === "polygon") {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      const flatPoints: number[] = [];

      for (const [px, py] of shape.points) {
        flatPoints.push(px, py);
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }

      annotations.push({
        id: annotationId++,
        image_id: imageId,
        category_id: categoryId,
        bbox: [minX, minY, maxX - minX, maxY - minY],
        area: polygonArea(shape.points),
        iscrowd: 0,
        segmentation: [flatPoints],
      });
    }
  }

  const cocoData = {
    images: [
      {
        id: imageId,
        file_name: meta.fileName,
        width: doc.width,
        height: doc.height,
      },
    ],
    categories,
    annotations,
  };

  return JSON.stringify(cocoData, null, 2);
}

/**
 * Exports an {@link AnnotationDoc} to YOLO detection and segmentation format.
 *
 * @param doc - Annotation document.
 * @returns Normalized text and skipped shapes count.
 */
export function exportYolo(doc: AnnotationDoc): { text: string; skipped: number } {
  if (
    !doc ||
    !isFiniteNumber(doc.width) ||
    !isFiniteNumber(doc.height) ||
    doc.width <= 0 ||
    doc.height <= 0
  ) {
    throw new AnnotateError("INVALID_SHAPE", "Invalid document dimensions");
  }

  const labelToIndex = new Map<string, number>();
  for (let i = 0; i < doc.labels.length; i++) {
    const lbl = doc.labels[i];
    if (lbl !== undefined) {
      labelToIndex.set(lbl, i);
    }
  }

  const lines: string[] = [];
  let skipped = 0;

  for (const shape of doc.shapes) {
    const classIdx = labelToIndex.get(shape.label);
    if (classIdx === undefined) {
      skipped++;
      continue;
    }

    if (shape.kind === "box") {
      const cx = (shape.x + shape.w / 2) / doc.width;
      const cy = (shape.y + shape.h / 2) / doc.height;
      const nw = shape.w / doc.width;
      const nh = shape.h / doc.height;
      lines.push(`${classIdx} ${cx.toFixed(6)} ${cy.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}`);
    } else if (shape.kind === "polygon") {
      const parts: string[] = [`${classIdx}`];
      for (const [px, py] of shape.points) {
        parts.push((px / doc.width).toFixed(6));
        parts.push((py / doc.height).toFixed(6));
      }
      lines.push(parts.join(" "));
    } else {
      skipped++;
    }
  }

  return {
    text: lines.length > 0 ? `${lines.join("\n")}\n` : "",
    skipped,
  };
}

/**
 * Imports a COCO JSON string into an {@link AnnotationDoc}.
 *
 * @param json - Serialized COCO JSON.
 * @param opts - Options including maxLength validation.
 * @returns Reconstructed annotation document.
 */
export function importCoco(json: string, opts?: { maxLength?: number }): AnnotationDoc {
  const maxLength = opts?.maxLength ?? 5_000_000;
  if (typeof json !== "string") {
    throw new AnnotateError("INVALID_JSON", "Input must be a JSON string");
  }
  if (json.length > maxLength) {
    throw new AnnotateError("INPUT_TOO_LARGE", `Input length exceeds maximum of ${maxLength}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AnnotateError("INVALID_JSON", "Malformed JSON string");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AnnotateError("INVALID_JSON", "Root must be an object");
  }

  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.images) || root.images.length === 0) {
    throw new AnnotateError("INVALID_JSON", "Missing images array");
  }
  const img = root.images[0] as Record<string, unknown>;
  if (
    !isFiniteNumber(img.width) ||
    !isFiniteNumber(img.height) ||
    img.width <= 0 ||
    img.height <= 0
  ) {
    throw new AnnotateError("INVALID_JSON", "Invalid image dimensions in COCO data");
  }

  if (!Array.isArray(root.categories)) {
    throw new AnnotateError("INVALID_JSON", "Missing categories array");
  }

  const idToLabel = new Map<number, string>();
  const labels: string[] = [];
  for (const cat of root.categories as Record<string, unknown>[]) {
    if (!isFiniteNumber(cat.id) || typeof cat.name !== "string") {
      throw new AnnotateError("INVALID_JSON", "Invalid category entry");
    }
    idToLabel.set(cat.id, cat.name);
    labels.push(cat.name);
  }

  const annotator = createAnnotator({
    width: img.width,
    height: img.height,
    labels,
  });

  if (Array.isArray(root.annotations)) {
    for (const ann of root.annotations as Record<string, unknown>[]) {
      const catId = ann.category_id;
      if (!isFiniteNumber(catId)) {
        throw new AnnotateError("UNKNOWN_LABEL", "Annotation refers to unknown category");
      }
      const label = idToLabel.get(catId);
      if (label === undefined) {
        throw new AnnotateError("UNKNOWN_LABEL", "Annotation refers to unknown category");
      }

      if (
        Array.isArray(ann.segmentation) &&
        ann.segmentation.length > 0 &&
        Array.isArray(ann.segmentation[0])
      ) {
        const flat = ann.segmentation[0] as unknown[];
        if (flat.length < 6 || flat.length % 2 !== 0) {
          throw new AnnotateError("INVALID_SHAPE", "Invalid polygon segmentation format");
        }
        const points: [number, number][] = [];
        for (let i = 0; i < flat.length; i += 2) {
          const x = flat[i];
          const y = flat[i + 1];
          if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
            throw new AnnotateError("INVALID_SHAPE", "Non-numeric polygon point");
          }
          points.push([x, y]);
        }
        annotator.add({ kind: "polygon", points, label });
      } else if (Array.isArray(ann.bbox) && ann.bbox.length === 4) {
        const [x, y, w, h] = ann.bbox as unknown[];
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
          throw new AnnotateError("INVALID_SHAPE", "Non-numeric box coordinates");
        }
        annotator.add({ kind: "box", x, y, w, h, label });
      } else {
        throw new AnnotateError("INVALID_SHAPE", "Unsupported annotation shape in COCO");
      }
    }
  }

  return annotator.doc();
}
