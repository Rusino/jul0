enum CodeUnitFlagsEnum {
  kNoCodeUnitFlag = 0,
  kPartOfWhiteSpace = 1,
  kGraphemeStart = 2,
  kSoftLineBreakBefore = 4,
  kHardLineBreakBefore = 8,
};

enum LineBreakTypeEnum {
  kSortLineBreakBefore  = 0,
  kHardLineBreakBefore = 1,
};

/*
enum TextDirectionEnum ={
  kLtr = 0,
  kRtl = 1,
};
*/

declare interface ObjectConstructor {
  assign(...objects: Object[]): Object;
}

class GlyphPos {
  public runIndex : number;
  public glyphIndex : number;

  constructor()
  constructor(runIndex : number, glyphIndex : number)
  constructor(runIndex? : number, glyphIndex? : number) {
      this.runIndex = runIndex;
      this.glyphIndex = glyphIndex;
  }
}

class TextRange {
  public start : number;
  public end : number;

  constructor()
  constructor(start : number, end : number)
  constructor(start? : number, end? : number) {
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
}

class Metrics {
  public ascent : number;
  public descent : number;
  public leading : number;

  constructor()
  constructor(font)
  constructor(font?) {
    if (font) {
      this.ascent = font.metrics.ascent;
      this.descent = font.metrics.descent;
      this.leading = font.metrics.descent;
    }
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
}

class Stretch {
    public glyphStart : GlyphPos;
    public glyphEnd : GlyphPos;
    public width : number;
    public textRange : TextRange;
    public metrics : Metrics;
    public empty = true;

  constructor()
  constructor(glyphStart : GlyphPos,
              textIndex : number,
              metrics : Metrics)
  constructor(glyphStart? : GlyphPos,
              textIndex? : number,
              metrics? : Metrics) {
    if (glyphStart == undefined) {
      this.empty = true;
      this.width = 0.0;
    } else {
      if (this.empty) {
        this.glyphStart = new GlyphPos();
        this.glyphEnd = new GlyphPos();
        this.textRange = new TextRange();
        this.metrics = new Metrics();
        this.empty = false;
      }
      Object.assign(this.glyphStart, glyphStart);
      Object.assign(this.glyphEnd, glyphStart);
      this.width = 0.0;
      this.textRange.start = textIndex;
      this.textRange.end = textIndex;
      Object.assign(this.metrics, metrics);
    }
  }

  isEmpty() {
    return  this.empty ||
           (this.glyphStart.runIndex === this.glyphEnd.runIndex &&
            this.glyphEnd.glyphIndex === this.glyphStart.glyphIndex);
  }

  clean() {
    this.empty = true;
    this.glyphStart = undefined;
    this.glyphEnd = undefined;
    this.textRange = undefined;
    this.metrics = undefined;
    this.width = 0.0;
  }

  moveTo(tail) {

    if (this.empty) {
      if (!tail.empty) {
        Object.assign(this, tail);
      }
      tail.clean();
      return;
    }

    console.assert(this.glyphEnd.runIndex !== tail.glyphStart.runIndex ||
                   this.glyphEnd.glyphIndex === tail.glyphStart.glyphIndex);
    Object.assign(this.glyphEnd, tail.glyphEnd);
    this.width += tail.width;
    this.textRange.merge(tail.textRange);
    this.metrics.merge(tail.metrics);
    tail.clean();
  }

  finish(glyphIndex : number, textIndex : number, width : number) {
    this.textRange.end = textIndex;
    this.glyphEnd.glyphIndex = glyphIndex;
    this.width = width;
  }
}

class Line {
  public textStart : GlyphPos;
  public textEnd : GlyphPos;
  public whitespacesEnd : GlyphPos;
  public text : TextRange;
  public whitespaces : TextRange;
  public textWidth : number;
  public spacesWidth : number;
  public metrics : Metrics;

  constructor()
  constructor(stretch, spaces)
  constructor(stretch?, spaces?) {
    this.textStart = Object.assign({}, stretch.glyphStart);
    this.textEnd = Object.assign({}, stretch.glyphEnd);
    this.whitespacesEnd = Object.assign({}, spaces.glyphEnd);
    this.text = Object.assign({}, stretch.textRange);
    this.whitespaces = Object.assign({}, spaces.textRange);

    console.assert(stretch.isEmpty() ||
                    spaces.isEmpty() ||
                    JSON.stringify(stretch.glyphEnd) === JSON.stringify(spaces.glyphStart));
    this.textWidth = stretch.width;
    this.spacesWidth = spaces.width;
  }
}

type SingleRunSingleStyleCallback = (style, glyphRange) => number;

class TextLayout {

  private fCodeUnitProperties : CodeUnitFlagsEnum[];
  private fLines : Line[];

  constructor() {
    this.fLines = new Array(0);
  }

  shape() {}
  measure(width) {}
  paint(x, y) {}

  hasProperty(index : number, flag : CodeUnitFlagsEnum) {
    return (this.fCodeUnitProperties[index] & flag) === flag;
  }

  isHardLineBreak(index : number) {
    return this.hasProperty(index, CodeUnitFlagsEnum.kHardLineBreakBefore);
  }

  isSoftLineBreak(index : number) {
    return this.hasProperty(index, CodeUnitFlagsEnum.kSoftLineBreakBefore);
  }

  isWhitespaces(stretch : Stretch) {
    if (stretch.textRange.width() > 0) {
      for (let i = stretch.textRange.start; i < stretch.textRange.end; ++i) {
        if (!this.hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
          return false;
        }
      }
    } else if (stretch.textRange.width() < 0) {
      for (let i = stretch.textRange.start; i > stretch.textRange.end; --i) {
        if (!this.hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
          return false;
        }
      }
    }
    return true;
  }

  computeCodeUnitProperties(inputs) {
    const textLayout = this;
    this.fCodeUnitProperties =
        new Array(10).fill(null).map(()=> CodeUnitFlagsEnum.kNoCodeUnitFlag);

    inputs.spaces.forEach(function (space, index) {
      textLayout.fCodeUnitProperties[space] |= CodeUnitFlagsEnum.kPartOfWhiteSpace;
    });

    inputs.linebreaks.forEach(function (linebreak, index) {
      textLayout.fCodeUnitProperties[linebreak.pos] |= linebreak.type
          ? LineBreakTypeEnum.kHardLineBreakBefore
          : LineBreakTypeEnum.kSortLineBreakBefore;
    });

    inputs.graphemes.forEach(function (grapheme, index) {
      textLayout.fCodeUnitProperties[grapheme] |= CodeUnitFlagsEnum.kGraphemeStart;
    });
  }

  private addLine(stretch, spaces) {
      this.fLines.push(new Line(stretch, spaces));
      stretch.clean();
      spaces.clean();
  }

  private findCluster(run, glyphIndex : number) {
      return run.clusters[glyphIndex];
  }

  intersect(a, b) {
      return { start : Math.max(a.start, b.start), end : Math.min(a.end, b.end) };
  }

  width(a) {
      return a.end - a.start;
  }

  glyphRangeWidth(run, glyphRange) {
      return run.positions[glyphRange.end] - run.positions[glyphRange.start];
  }

  glyphRange(run, textRange) {
      let glyphRange = { start: undefined, end: undefined};
      for (let i = 0; i < run.clusters.size(); ++i) {
          const cluster = run.clusters[i];
          if (cluster < textRange.start) continue;
          if (cluster > textRange.end) break;

          if (glyphRange.start == undefined) {
              glyphRange.start = i;
          }
          glyphRange.end = i;
      }
      return glyphRange;
  }

  textRange(run, glyphRange) {
      let textRange = { start: undefined, end: undefined };
      for (let i = 0; i < run.clusters.size(); ++i) {
          const cluster = run.clusters[i];
          if (i < glyphRange.start) continue;
          if (i > glyphRange.end) break;

          if (textRange.start == undefined) {
            textRange.start = i;
          }
          textRange.end = i;
      }
  }

  breakShapedTextIntoLines(inputs, lineMax) {

    // line : spaces : clusters
    const textLayout = this;
    let line = new Stretch();
    let spaces = new Stretch();
    let clusters = new Stretch();
    inputs.runs.forEach(function (run, runIndex) {
      let cluster = null;
      run.clusters.forEach(function(textIndex, glyphIndex) {
        if (!cluster) {
          cluster = new Stretch(new GlyphPos(runIndex, glyphIndex), textIndex, new Metrics(run.font));
          return;
        } else if (cluster.textRange.start == textIndex) {
          return;
        }
        console.assert(cluster.glyphStart.runIndex === runIndex,
              "The entire cluster belongs to a single run");
        const width = run.positions[glyphIndex].x - run.positions[cluster.glyphStart.glyphIndex].x;
        cluster.finish(glyphIndex, textIndex, width);
        const isHardLineBreak = textLayout.isHardLineBreak(cluster.textRange.start);
        const isSoftLineBreak = textLayout.isSoftLineBreak(cluster.textRange.start);
        const isWhitespaces = textLayout.isWhitespaces(cluster);
        const isEndOfText = textIndex === inputs.text.length;

        if (isHardLineBreak || isEndOfText || isSoftLineBreak || isWhitespaces) {
          if (!clusters.isEmpty()) {
            line.moveTo(spaces);
            line.moveTo(clusters);
          }
          if (isWhitespaces) {
            spaces.moveTo(cluster);
          }
          if (isHardLineBreak) {
            textLayout.addLine(line, spaces);
            return;
          }
          if (isEndOfText) {
            line.moveTo(cluster);
            if (!line.isEmpty()) {
              textLayout.addLine(line, spaces);
            }
            return;
          }
        }
        if ((line.width + spaces.width + clusters.width + cluster.width) <= lineMax) {
          clusters.moveTo(cluster);
        } else {
          // Wrapping the text by whitespaces
          if (line.isEmpty()) {
            if (clusters.isEmpty()) {
              line.moveTo(cluster);
            } else {
              line.moveTo(clusters);
            }
          }
          textLayout.addLine(line, spaces);
          clusters.moveTo(cluster);
        }
        cluster = new Stretch(new GlyphPos(runIndex, glyphIndex), textIndex, new Metrics(run.font));
      });
/*
      run.positions.forEach(function(glyphOffset, glyphIndex) {

        const index = run.clusters[glyphIndex];
        if (!cluster) {
          cluster = new Stretch(new GlyphPos(runIndex, glyphIndex), index, new Metrics(run.font));
          return;
        } else if (cluster.textRange.start === index) {
          return;
        }

        console.assert(cluster.glyphStart.runIndex === runIndex);
        cluster.textRange.end = index;
        cluster.glyphEnd = new GlyphPos(runIndex, glyphIndex);
        cluster.width = glyphOffset.x - run.positions[cluster.glyphStart.glyphIndex].x;

        const isHardLineBreak = textLayout.isHardLineBreak(cluster.textRange.start);
        const isSoftLineBreak = textLayout.isSoftLineBreak(cluster.textRange.start);
        const isWhitespaces = textLayout.isWhitespaces(cluster);
        const isEndOfText = glyphIndex === run.positions.length;

        if (isEndOfText) {
          clusters.moveTo(cluster);
        }

        if (isHardLineBreak || isEndOfText || isSoftLineBreak || isWhitespaces) {
          if (!clusters.isEmpty()) {
            line.moveTo(spaces);
            line.moveTo(clusters);
          }
        }

        if (isHardLineBreak) {
          textLayout.addLine(line, spaces);
          return;
        }
        if (isEndOfText) {
          console.assert (!line.isEmpty(), "Line cannot be empty - we just found the last cluster");
          textLayout.addLine(line, spaces);
          return;
        }

        if (isWhitespaces) {
          spaces.moveTo(cluster);
        } else if ((line.width + spaces.width + clusters.width + cluster.width) <= lineMax) {
          clusters.moveTo(cluster);
        } else {
          if (line.isEmpty()) {
            if (clusters.isEmpty()) {
              line.moveTo(cluster);
            } else {
              line.moveTo(clusters);
            }
          }
          textLayout.addLine(line, spaces);
          clusters.moveTo(cluster);
        }
        cluster = new Stretch(new GlyphPos(runIndex, glyphIndex), index, new Metrics(run.font));
      });
*/
    });

     textLayout.fLines.forEach(function(line, lineIndex) {
      const text = inputs.text.substring(line.text.start, line.text.end);
      document.body.appendChild(document.createElement('pre')).innerHTML += text + "\n";
    });
  }

  breakRunIntoStyles(inputs, runStart, run, glyphRange, callback: SingleRunSingleStyleCallback) {

      const textRange = this.glyphRange(run, glyphRange);
      for (let block of inputs.blocks) {

          const intersect = this.intersect(block.textRange, textRange);
          if (this.width(intersect) == 0) {
              continue;
          }

          const glyphRange = this.glyphRange(run, intersect);
          runStart += callback(block.style, glyphRange);
      }
  }

  generateDrawingOperations(inputs, outputs) {

    const textLayout = this;
    // TODO: Sort runs on the line accordingly to the visual order (for LTR/RTL mixture)
    // Iterate through all the runs on the line
    let runStart = 0.0;
    let lineVerticalStart = 0.0;
    this.fLines.forEach(function (line, lineIndex) {
      var run = null;
      var lastRunIndex;
      for (var runIndex = line.textStart.runIndex; runIndex <= line.textEnd.runIndex; ++runIndex) {
        if (run != null && lastRunIndex != runIndex) {
            continue;
        }
        run = inputs.runs[runIndex];
        lastRunIndex = runIndex;
        let runGlyphRange = {
            start: line.textStart.runIndex ? line.textStart.glyphIndex : 0,
            end: line.textEnd.runIndex ? line.textEnd.glyphIndex : run.glyphs.size()
        }

        // Iterate through all the styles in the run
        // TODO: For now assume that the style edges are cluster edges and don't fall between clusters
        // TODO: Just show the text, not decorations of any kind
        textLayout.breakRunIntoStyles(inputs, runStart, run, runGlyphRange, function(style, glyphRange) {
          // left, top, right, bottom
          let runWidth = textLayout.glyphRangeWidth(run, glyphRange);
          if (style.background == undefined) {
            return runWidth;
          }
          let rectangle = {
              backgroundColor: style.background,
              left: runStart,
              top: lineVerticalStart,
              width: runWidth,
              height: run.font.metrics.ascent + run.font.metrics.descent + run.font.metrics.leading
          };
          outputs.rectangles.push(rectangle);
          return runWidth;
        });

        textLayout.breakRunIntoStyles(inputs, runStart, run, runGlyphRange, function(style, glyphRange) {
          // TODO: Ignore clipping cluster by position for now
          let textBlob = {
              foregroundColor: style.foreground,
              run : runIndex,
              glyphRange: glyphRange,
              shift: {
                  x: runStart,
                  y: lineVerticalStart
              }
          };
          outputs.textBlobs.push(textBlob);

          return textLayout.glyphRangeWidth(run, glyphRange);
        });
      }
    });
  }
}