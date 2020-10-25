const CodeUnitFlagsEnum = {
  kNoCodeUnitFlag : 0,
  kPartOfWhiteSpace : 1,
  kGraphemeStart : 2,
  kSoftLineBreakBefore : 4,
  kHardLineBreakBefore : 8,
};

const LineBreakTypeEnum = {
  kSortLineBreakBefore : 0,
  kHardLineBreakBefore : 1,
};
/*
const TextDirectionEnum = {
  kLtr : 0,
  kRtl : 1,
};
*/
class GlyphPos {
    constructor(runIndex, glyphIndex) {
        this.runIndex = runIndex;
        this.glyphIndex = glyphIndex;
    }
    runIndex;
    glyphIndex;
}

class TextRange {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }

    width() {
      return this.end - this.start;
    }

    clean() {
      this.start = 0;
      this.end = 0;
    }

    isEmpty() {
      return this.end === this.start;
    }

    merge(tail) {
      console.assert(this.end === tail.start);
      this.start = Math.min(this.start, tail.start);
      this.end = Math.max(this.end, tail.end);
    }

    start;
    end;
}

class Metrics {
    constructor(font) {
        this.ascent = font.metrics.ascent;
        this.descent = font.metrics.descent;
        this.leading = font.metrics.descent;
    }

    merge(tail) {
      if (typeof(tail) === "undefined") {
        return;
      }
      this.ascent = Math.min(this.ascent, tail.ascent);
      this.descent = Math.max(this.descent, tail.descent);
      this.leading = Math.max(this.leading, tail.leading);
    }

    clean() {
      this.ascent = 0;
      this.descent = 0;
      this.leading = 0;
    }

    ascent;
    descent;
    leading;
}

class Stretch {
  constructor(glyphPos, clusterPos, metrics) {
    this.isUndefined = typeof(glyphPos) == "undefined";
    this.glyphStart = glyphPos;
    this.glyphEnd = glyphPos;
    this.width = 0.0;
    this.textRange = new TextRange(clusterPos, clusterPos);
    this.metrics = metrics;
  }

  isEmpty() {
    return  this.isUndefined ||
            this.textRange.isEmpty() ||
           (this.glyphStart.runIndex === this.glyphEnd.runIndex &&
            this.glyphEnd.glyphIndex === this.glyphStart.glyphIndex);
  }

  clean() {
    this.glyphStart = this.glyphEnd;
    this.width = 0;
    this.metrics.clean();
    this.textRange.start = this.textRange.end;
    this.isUndefined = false;
  }

  moveTo(tail) {
    if (this.isUndefined) {
      if (tail.isUndefined) {
        return;
      }
      this.glyphStart = Object.assign({}, tail.glyphStart);
      this.glyphEnd = Object.assign({}, tail.glyphEnd);
      this.width = tail.width;
      this.textRange = Object.assign({}, tail.textRange);
      //this.textRange = tail.textRange;
      this.metrics = tail.metrics;
      this.isUndefined = false;
      tail.clean();
      return;
    } else if (tail.isUndefined) {
      return;
    }

    console.assert(this.glyphEnd.runIndex !== tail.glyphStart.runIndex ||
                   this.glyphEnd.glyphIndex === tail.glyphStart.glyphIndex);
    this.glyphEnd = tail.glyphEnd;
    this.width += tail.width;
    this.textRange.merge(tail.textRange);
    this.metrics.merge(tail.metrics);
    tail.clean();
  }

  /* GlyphPos */ glyphStart;
  /* GlyphPos */ glyphEnd;
  /* TextRange */ textRange;
  width;
  metrics;
  isUndefined;
}

class Line {
  constructor(stretch, spaces) {
    this.textStart = stretch.glyphStart;
    this.textEnd = stretch.glyphEnd;
    if (spaces.isEmpty()) {
      this.whiteSpacesEnd = new GlyphPos();
    } else {
      this.whiteSpacesEnd = spaces.glyphEnd;
      console.assert(stretch.glyphEnd === spaces.glyphStart);
    }
    this.text = stretch.textRange;
    this.whitespaces = spaces.textRange;
  }
  /* GlyphPos */ textStart;
  /* GlyphPos */ textEnd;
  /* GlyphPos */ whiteSpacesEnd;
  /* TextRange */ text;
  /* TextRange */ whitespaces;
}

class TextLayout {

  #CodeUnitProperties;
  #Lines;

  constructor() {
    this.#Lines = [];
  }

  measure(width) {}
  paint(x, y) {}

  #hasProperty(index, flag) {
    return (this.#CodeUnitProperties[index] & flag) === flag;
  }

  #isWhitespaces(stretch) {
    for (let i = stretch.textRange.start; i < stretch.textRange.end; ++i) {
        if (!this.#hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
            return false;
        }
    }
    return true;
  }

  computeCodeUnitProperties(inputs) {
    const textLayout = this;
    this.#CodeUnitProperties = new Array(inputs.text.length).fill(CodeUnitFlagsEnum.kNoCodeUnitFlag);

    inputs.spaces.forEach(function (space, index) {
      textLayout.#CodeUnitProperties[space] |= CodeUnitFlagsEnum.kPartOfWhiteSpace;
    });

    inputs.linebreaks.forEach(function (linebreak, index) {
      textLayout.#CodeUnitProperties[linebreak.pos] |= linebreak.type
          ? LineBreakTypeEnum.kHardLineBreakBefore
          : LineBreakTypeEnum.kSortLineBreakBefore;
    });

    inputs.graphemes.forEach(function (grapheme, index) {
      textLayout.#CodeUnitProperties[grapheme] |= CodeUnitFlagsEnum.kGraphemeStart;
    });
  }

  #addLine(stretch, spaces) {
      this.#Lines.push(new Line(stretch, spaces));
      stretch.clean();
      spaces.clean();
  }

  // Add textDirection
  breakShapedTextIntoLines(inputs, lineMax) {

    // line : spaces : clusters
    let line = new Stretch();
    let spaces = new Stretch();
    let clusters = new Stretch();

    // Iterate through all the runs
    const textLayout = this;
    inputs.runs.forEach(function (run, runIndex) {
      let cluster = null;
      // Iterate through all glyphs in the run
      run.positions.forEach(function(pos, posIndex) {

        const index = run.clusters[posIndex];
        if (!cluster) {
          // First cluster in the run
          cluster = new Stretch(new GlyphPos(runIndex, posIndex), index, new Metrics(run.font));
          return;
        } else if (cluster.textRange.start === index) {
          // Skip all the glyphs of the same cluster
          return;
        }

        // Finish the cluster
        console.assert(cluster.glyphStart.runIndex === runIndex);
        cluster.textRange.end = index;
        cluster.glyphEnd = new GlyphPos(runIndex, posIndex);
        cluster.width = pos.x - run.positions[cluster.glyphStart.glyphIndex].x;

        const isHardLineBreak = textLayout.#hasProperty(cluster.textRange.start, CodeUnitFlagsEnum.kHardLineBreakBefore);
        const isSoftLineBreak = textLayout.#hasProperty(cluster.textRange.start, CodeUnitFlagsEnum.kSoftLineBreakBefore);
        const isWhitespaces = textLayout.#isWhitespaces(cluster);
        const isEndOfText = posIndex === run.positions.length - 1;

        if (isHardLineBreak || isEndOfText || isSoftLineBreak || isWhitespaces) {
          // Word break; normalize the line
          if (!clusters.isEmpty()) {
            line.moveTo(spaces);
            line.moveTo(clusters);
          }
        }

        if (isHardLineBreak || isEndOfText) {
          // Whatever we had before it does fit the line
          textLayout.#addLine(line, spaces);
          // Ignore the cluster itself with hard line break?
        } else if (isWhitespaces) {
          // We don't have to add a line - whitespaces get trimmed at the end of the line
          if (line.isEmpty()) {
            // Ignore the space at the beginning of the line
          } else {
            console.assert(spaces.isEmpty() && clusters.isEmpty());
            spaces.moveTo(cluster);
          }
        } else if ((line.width + spaces.width + clusters.width + cluster.width) > lineMax) {
          const lineText = inputs.text.substring(line.textRange.start, line.textRange.end);
          const clustersText = inputs.text.substring(clusters.textRange.start, clusters.textRange.end);
          const clusterText = inputs.text.substring(cluster.textRange.start, cluster.textRange.end);
          console.error("line:     '" + lineText + "' " + spaces.width + "\n");
          console.error("clusters: '" + clustersText + "'\n");
          console.error("cluster:  '" + clusterText + "'\n");
          // The cluster does not fit the line
          if (!line.isEmpty()) {
            // Add what we have on the line
            clusters.moveTo(cluster);
          } else if (!clusters.isEmpty()) {
            // The word does not fit the line; add as many clusters as we can
            line.moveTo(clusters);
            clusters.moveTo(cluster);
          } else {
            // The cluster does not fit the line anyway; add it clipped
            line.moveTo(cluster);
          }
          textLayout.#addLine(line, spaces);
        } else {
          // A regular cluster that fits the line: go on
          clusters.moveTo(cluster);
        }
        cluster = new Stretch(new GlyphPos(runIndex, posIndex), index, new Metrics(run.font));
      });
    });

    //document.body.appendChild(document.createElement('pre')).innerHTML = syntaxHighlight(textLayout.#Lines);
    textLayout.#Lines.forEach(function(line, lineIndex) {
      const text = inputs.text.substring(line.text.start, line.text.end);
      document.body.appendChild(document.createElement('pre')).innerHTML += text + "\n";
    });
  }
}