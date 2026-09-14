/** Runs inside the page. Keep this function closure-free for page.evaluate. */
export function discoverNativeCandidates() {
  const candidates = [];
  const warnings = [];
  const shots = Array.from(document.querySelectorAll(".shot[id]"));

  function unsupportedReason(element, shot) {
    for (let node = element; node; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      if (tag === "canvas" || tag === "svg" || tag === "video") return `${tag} is unsupported`;
      const style = getComputedStyle(node);
      if (node !== shot && (["hidden", "clip", "scroll"].includes(style.overflow) ||
          ["hidden", "clip", "scroll"].includes(style.overflowX) ||
          ["hidden", "clip", "scroll"].includes(style.overflowY))) return "clipped or scrolling overflow is unsupported";
      if (style.clipPath !== "none") return "clip-path is unsupported";
      if (style.maskImage !== "none") return "mask-image is unsupported";
      if (style.filter !== "none") return "filter is unsupported";
      if (style.backdropFilter && style.backdropFilter !== "none") return "backdrop-filter is unsupported";
      if (style.mixBlendMode !== "normal") return "mix-blend-mode is unsupported";
      if (style.perspective !== "none") return "perspective is unsupported";
      if (style.transform.startsWith("matrix3d(")) return "3D transform is unsupported";
      if (node === shot) break;
    }
    const before = getComputedStyle(element, "::before").content;
    const after = getComputedStyle(element, "::after").content;
    if ((before && before !== "none" && before !== "normal" && before !== '""') ||
        (after && after !== "none" && after !== "normal" && after !== '""')) return "pseudo-element content is unsupported";
    const own = getComputedStyle(element);
    if (own.backgroundImage && own.backgroundImage !== "none" &&
        (own.webkitBackgroundClip === "text" || own.backgroundClip === "text" || own.webkitTextFillColor === "transparent")) {
      return "gradient text is unsupported";
    }
    if ([own.borderTopWidth, own.borderRightWidth, own.borderBottomWidth, own.borderLeftWidth]
      .some(value => Number.parseFloat(value) > 0)) return "borders are unsupported";
    if (Number.parseFloat(own.borderRadius) > 0) return "rounded clipping is unsupported";
    if (kindOf(element) === "image" && own.objectFit !== "fill") return "image object-fit is unsupported";
    if (kindOf(element) === "text") {
      if (own.textShadow !== "none") return "text shadow is unsupported";
      if (Number.parseFloat(own.webkitTextStrokeWidth || "0") > 0) return "text stroke is unsupported";
      if (own.textDecorationLine && own.textDecorationLine !== "none") return "text decoration is unsupported";
      if ([own.paddingTop, own.paddingRight, own.paddingBottom, own.paddingLeft]
        .some(value => Number.parseFloat(value) > 0)) return "text padding is unsupported";
    }
    return null;
  }

  function kindOf(element) {
    return element.tagName.toLowerCase() === "img" ? "image" : "text";
  }

  for (let shotIndex = 0; shotIndex < shots.length; shotIndex++) {
    const shot = shots[shotIndex];
    const elements = Array.from(shot.querySelectorAll("img, *"));
    let order = 0;
    for (const element of elements) {
    const kind = element.tagName.toLowerCase() === "img"
        ? "image"
        : element.children.length === 0 && (element.textContent || "").trim() ? "text" : null;
      if (!kind) continue;
      const id = `native-${shotIndex}-${order++}`;
      element.dataset.pitchNativeId = id;
      const name = (element.getAttribute("aria-label") || element.getAttribute("alt") ||
        (kind === "text" ? element.textContent : element.getAttribute("src")) || id).trim();
      const reason = unsupportedReason(element, shot);
      if (reason) {
        warnings.push(`${name} (${id}): ${reason}`);
        continue;
      }
      if (candidates.length >= 100) continue;
      const style = getComputedStyle(element);
      const image = kind === "image" ? element : null;
      const box = kind === "image"
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: element.offsetWidth, height: element.offsetHeight };
      candidates.push({
        id,
        name,
        shotId: shot.id,
        kind,
        ...(kind === "image" ? { source: image.currentSrc || image.src } : { text: (element.textContent || "").trim() }),
        ...(kind === "text" ? {
          font: {
            family: style.fontFamily,
            style: style.fontStyle,
            weight: style.fontWeight,
            size: Number.parseFloat(style.fontSize),
            lineHeight: style.lineHeight === "normal" ? Number.parseFloat(style.fontSize) * 1.2 : Number.parseFloat(style.lineHeight),
            tracking: style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing),
            color: style.color,
            align: style.textAlign,
          },
        } : {}),
        box,
      });
    }
  }
  const eligible = shots.reduce((sum, shot) => sum + Array.from(shot.querySelectorAll("img, *")).filter(element =>
    element.tagName.toLowerCase() === "img" || (element.children.length === 0 && (element.textContent || "").trim())).length, 0);
  if (eligible > 100) warnings.push(`Native layer capture capped at 100 of ${eligible} candidates`);
  return { candidates, warnings };
}

/** Runs inside the page. Keep this function closure-free for page.evaluate. */
export function sampleNativeCandidates(candidateIds) {
  const byId = new Map(Array.from(document.querySelectorAll("[data-pitch-native-id]"), element =>
    [element.getAttribute("data-pitch-native-id"), element]));

  return candidateIds.map(id => {
    const element = byId.get(id);
    if (!element) return { id, warning: "candidate disappeared" };
    const shot = element.closest(".shot[id]");
    const before = getComputedStyle(element, "::before").content;
    const after = getComputedStyle(element, "::after").content;
    if ((before && before !== "none" && before !== "normal" && before !== '""') ||
        (after && after !== "none" && after !== "normal" && after !== '""')) return { id, warning: "pseudo-element content is unsupported" };
    const elementStyle = getComputedStyle(element);
    if (elementStyle.backgroundImage && elementStyle.backgroundImage !== "none" &&
        (elementStyle.webkitBackgroundClip === "text" || elementStyle.backgroundClip === "text" || elementStyle.webkitTextFillColor === "transparent")) {
      return { id, warning: "gradient text is unsupported" };
    }
    if ([elementStyle.borderTopWidth, elementStyle.borderRightWidth, elementStyle.borderBottomWidth, elementStyle.borderLeftWidth]
      .some(value => Number.parseFloat(value) > 0)) return { id, warning: "borders are unsupported" };
    if (Number.parseFloat(elementStyle.borderRadius) > 0) return { id, warning: "rounded clipping is unsupported" };
    const isImage = element.tagName.toLowerCase() === "img";
    if (isImage && elementStyle.objectFit !== "fill") return { id, warning: "image object-fit is unsupported" };
    if (!isImage) {
      if (elementStyle.textShadow !== "none") return { id, warning: "text shadow is unsupported" };
      if (Number.parseFloat(elementStyle.webkitTextStrokeWidth || "0") > 0) return { id, warning: "text stroke is unsupported" };
      if (elementStyle.textDecorationLine && elementStyle.textDecorationLine !== "none") return { id, warning: "text decoration is unsupported" };
      if ([elementStyle.paddingTop, elementStyle.paddingRight, elementStyle.paddingBottom, elementStyle.paddingLeft]
        .some(value => Number.parseFloat(value) > 0)) return { id, warning: "text padding is unsupported" };
    }
    let opacity = 1;
    let visible = true;
    let fallbackRotated = false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const tag = node.tagName.toLowerCase();
      if (tag === "canvas" || tag === "svg" || tag === "video") return { id, warning: `${tag} is unsupported` };
      if (node !== shot && (["hidden", "clip", "scroll"].includes(style.overflow) ||
          ["hidden", "clip", "scroll"].includes(style.overflowX) ||
          ["hidden", "clip", "scroll"].includes(style.overflowY))) return { id, warning: "clipped or scrolling overflow is unsupported" };
      if (style.clipPath !== "none") return { id, warning: "clip-path is unsupported" };
      if (style.maskImage !== "none") return { id, warning: "mask-image is unsupported" };
      if (style.filter !== "none") return { id, warning: "filter is unsupported" };
      if (style.backdropFilter && style.backdropFilter !== "none") return { id, warning: "backdrop-filter is unsupported" };
      if (style.mixBlendMode !== "normal") return { id, warning: "mix-blend-mode is unsupported" };
      if (style.perspective !== "none") return { id, warning: "perspective is unsupported" };
      if (style.transform.startsWith("matrix3d(")) return { id, warning: "3D transform is unsupported" };
      opacity *= Number.parseFloat(style.opacity) || 0;
      if (style.display === "none" || style.visibility !== "visible") visible = false;
      if (style.transform !== "none" && !style.transform.startsWith("matrix3d(")) {
        const match = style.transform.match(/^matrix\(([^)]+)\)$/);
        if (!match) fallbackRotated = true;
        else {
          const values = match[1].split(",").map(Number);
          if (Math.abs(values[1]) > 0.00001 || Math.abs(values[2]) > 0.00001) fallbackRotated = true;
        }
      }
      if (node === shot) break;
    }

    let centerX;
    let centerY;
    let worldWidth;
    let worldHeight;
    let rotation;
    if (typeof element.getBoxQuads === "function") {
      const quad = element.getBoxQuads()[0];
      if (!quad) return { id, warning: "element has no world-space quad" };
      const topX = quad.p2.x - quad.p1.x;
      const topY = quad.p2.y - quad.p1.y;
      const sideX = quad.p4.x - quad.p1.x;
      const sideY = quad.p4.y - quad.p1.y;
      worldWidth = Math.hypot(topX, topY);
      worldHeight = Math.hypot(sideX, sideY);
      const dot = worldWidth && worldHeight ? Math.abs((topX * sideX + topY * sideY) / (worldWidth * worldHeight)) : 1;
      const opposite = Math.hypot(quad.p3.x - quad.p4.x, quad.p3.y - quad.p4.y);
      if (dot > 0.001 || Math.abs(opposite - worldWidth) > 0.05) return { id, warning: "skew or nonorthogonal geometry is unsupported" };
      centerX = (quad.p1.x + quad.p2.x + quad.p3.x + quad.p4.x) / 4;
      centerY = (quad.p1.y + quad.p2.y + quad.p3.y + quad.p4.y) / 4;
      rotation = Math.atan2(topY, topX) * 180 / Math.PI;
    } else {
      if (fallbackRotated) return { id, warning: "rotated geometry requires getBoxQuads" };
      const rect = element.getBoundingClientRect();
      centerX = rect.x + rect.width / 2;
      centerY = rect.y + rect.height / 2;
      worldWidth = rect.width;
      worldHeight = rect.height;
      rotation = 0;
    }
    const image = isImage ? element : null;
    const color = image ? null : elementStyle.color;
    const alphaMatch = color && color.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/i);
    return {
      id,
      text: image ? null : (element.textContent || "").trim(),
      source: image ? image.currentSrc || image.src : null,
      color,
      colorAlpha: alphaMatch?.[1] === undefined ? 1 : Number(alphaMatch[1]),
      font: image ? null : {
        family: elementStyle.fontFamily,
        style: elementStyle.fontStyle,
        weight: elementStyle.fontWeight,
        size: Number.parseFloat(elementStyle.fontSize),
        lineHeight: elementStyle.lineHeight === "normal" ? Number.parseFloat(elementStyle.fontSize) * 1.2 : Number.parseFloat(elementStyle.lineHeight),
        tracking: elementStyle.letterSpacing === "normal" ? 0 : Number.parseFloat(elementStyle.letterSpacing),
        align: elementStyle.textAlign,
      },
      baseWidth: image ? image.naturalWidth : element.offsetWidth,
      baseHeight: image ? image.naturalHeight : element.offsetHeight,
      centerX,
      centerY,
      worldWidth,
      worldHeight,
      rotation,
      opacity,
      visible: visible && worldWidth > 0 && worldHeight > 0 && opacity > 0,
      warning: null,
    };
  });
}

function rounded(value) {
  return Number(value.toFixed(4));
}

function reduceKeys(keys, tolerance) {
  if (keys.length <= 2) return keys;
  const kept = [keys[0]];
  for (let index = 1; index < keys.length - 1; index++) {
    const previous = kept[kept.length - 1];
    const current = keys[index];
    const next = keys[index + 1];
    const ratio = (current[0] - previous[0]) / (next[0] - previous[0]);
    let redundant = true;
    for (let column = 1; column < current.length; column++) {
      const expected = previous[column] + (next[column] - previous[column]) * ratio;
      if (Math.abs(current[column] - expected) > tolerance) redundant = false;
    }
    if (!redundant) kept.push(current);
  }
  kept.push(keys[keys.length - 1]);
  return kept;
}

export function buildNativeLayerSidecar(discovery, samples, options) {
  const warnings = [...(discovery?.warnings || [])];
  const layers = [];
  const candidates = Array.isArray(discovery?.candidates) ? discovery.candidates : [];
  const frames = Number(options.frames);
  if (!Number.isInteger(frames) || frames < 0 || samples.length !== frames) throw new Error("Native layer samples must match output frames");

  for (const candidate of candidates) {
    const values = samples.map(frame => frame.find(value => value.id === candidate.id));
    const problem = values.find(value => !value || value.warning);
    const label = `${candidate.name} (${candidate.id})`;
    if (problem) {
      warnings.push(`${label}: ${problem?.warning || "sample missing"}`);
      continue;
    }
    if (!(candidate.box.width > 0 && candidate.box.height > 0) ||
        values.some(value => ![value.centerX, value.centerY, value.worldWidth, value.worldHeight, value.rotation, value.opacity].every(Number.isFinite))) {
      warnings.push(`${label}: geometry is invalid`);
      continue;
    }
    if (values.some(value => value.baseWidth !== candidate.box.width || value.baseHeight !== candidate.box.height)) {
      warnings.push(`${label}: base dimensions changed during capture`);
      continue;
    }
    if (candidate.kind === "text" && values.some(value => value.text !== candidate.text)) {
      warnings.push(`${label}: text changed during capture`);
      continue;
    }
    if (candidate.kind === "text" && values.some(value => value.color !== candidate.font.color)) {
      warnings.push(`${label}: text color changed during capture`);
      continue;
    }
    if (candidate.kind === "text" && values.some(value =>
      !value.font || value.font.family !== candidate.font.family || value.font.style !== candidate.font.style ||
      value.font.weight !== candidate.font.weight || value.font.size !== candidate.font.size ||
      value.font.lineHeight !== candidate.font.lineHeight || value.font.tracking !== candidate.font.tracking ||
      value.font.align !== candidate.font.align)) {
      warnings.push(`${label}: typography changed during capture`);
      continue;
    }
    if (candidate.kind === "image" && values.some(value => value.source !== candidate.source)) {
      warnings.push(`${label}: image source changed during capture`);
      continue;
    }
    const visibleFrames = values.map((value, frame) => value.visible ? frame : -1).filter(frame => frame >= 0);
    if (!visibleFrames.length) continue;
    const visibleStart = visibleFrames[0];
    const visibleEnd = visibleFrames[visibleFrames.length - 1] + 1;
    if (visibleFrames.length !== visibleEnd - visibleStart) {
      warnings.push(`${label}: visibility is discontinuous`);
      continue;
    }
    // Keep one zero-opacity sample on either side so fades remain fades in AE
    // instead of starting or ending on the first nonzero frame.
    const inFrame = Math.max(0, visibleStart - 1);
    const outFrame = Math.min(frames, visibleEnd + 1);
    let asset;
    if (candidate.kind === "image") {
       asset = options.assetPath?.[candidate.source];
       if (!asset) {
        warnings.push(`${label}: image source is not an approved workspace raster asset`);
        continue;
      }
    }
    const span = values.slice(inFrame, outFrame);
    const key = projector => reduceKeys(span.map((value, offset) => [inFrame + offset, ...projector(value).map(rounded)]), 0.01);
    layers.push({
      id: candidate.id,
      name: candidate.name,
      shotId: candidate.shotId,
      kind: candidate.kind,
       ...(asset ? { asset, assetSha256: options.assetSha256?.[candidate.source] } : {}),
      ...(candidate.kind === "text" ? { text: candidate.text, font: candidate.font } : {}),
      box: candidate.box,
      inFrame,
      outFrame,
      keys: {
        position: key(value => [value.centerX, value.centerY]),
        scale: key(value => [value.worldWidth / value.baseWidth * 100, value.worldHeight / value.baseHeight * 100]),
        rotation: key(value => [value.rotation]),
        opacity: key(value => [value.opacity * value.colorAlpha * 100]),
      },
      warnings: [],
    });
  }
  return {
    version: 1,
    stage: options.stage,
    fps: options.fps,
    frames,
    sourceBytes: options.sourceBytes,
    sourceMtimeMs: options.sourceMtimeMs,
    sourceSha256: options.sourceSha256,
    layers,
    warnings,
  };
}
