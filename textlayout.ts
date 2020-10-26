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
}

class Line {
  public textStart : GlyphPos;
  public textEnd : GlyphPos;
  public whitespacesEnd : GlyphPos;
  public text : TextRange;
  public whitespaces : TextRange;
  public textWidth : number;
  public spacesWidth : number;

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

class TextLayout {

  private fCodeUnitProperties : CodeUnitFlagsEnum[];
  private fLines : Line[];

  constructor() {
    this.fLines = new Array(0);
  }

  measure(width) {}
  paint(x, y) {}

  hasProperty(index, flag) {
    return (this.fCodeUnitProperties[index] & flag) === flag;
  }

  isWhitespaces(stretch) {
    for (let i = stretch.textRange.start; i < stretch.textRange.end; ++i) {
        if (!this.hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
            return false;
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

        const isHardLineBreak = textLayout.hasProperty(cluster.textRange.start, CodeUnitFlagsEnum.kHardLineBreakBefore);
        const isSoftLineBreak = textLayout.hasProperty(cluster.textRange.start, CodeUnitFlagsEnum.kSoftLineBreakBefore);
        const isWhitespaces = textLayout.isWhitespaces(cluster);
        const isEndOfText = posIndex === run.positions.length - 1;

        if (isHardLineBreak || isEndOfText || isSoftLineBreak || isWhitespaces) {
          // Word break; normalize the line
          if (!clusters.isEmpty()) {
            line.moveTo(spaces);
            line.moveTo(clusters);
          }
        }

        if (isHardLineBreak) {
          // Whatever we had before it does fit the line
          textLayout.addLine(line, spaces);
          // Ignore the cluster itself with hard line break?
        } else if (isEndOfText) {
          line.moveTo(cluster);
          if (!line.isEmpty()) {
            textLayout.addLine(line, spaces);
          }
          return;
        } else if (isWhitespaces) {
          // We don't have to add a line - whitespaces get trimmed at the end of the line
          if (line.isEmpty()) {
            // Ignore the space at the beginning of the line
          } else {
            console.assert(spaces.isEmpty() && clusters.isEmpty());
            spaces.moveTo(cluster);
          }
        } else if ((line.width + spaces.width + clusters.width + cluster.width) > lineMax) {
          const lineText = line.isEmpty() ? "[]" : inputs.text.substring(line.textRange.start, line.textRange.end);
          const clustersText = clusters.isEmpty() ? "[]" : inputs.text.substring(clusters.textRange.start, clusters.textRange.end);
          const clusterText = cluster.isEmpty() ? "[]" :inputs.text.substring(cluster.textRange.start, cluster.textRange.end);
          console.log("line:     '" + lineText + "' " + spaces.width + "\n");
          console.log("clusters: '" + clustersText + "'\n");
          console.log("cluster:  '" + clusterText + "'\n");
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
          textLayout.addLine(line, spaces);
        } else {
          // A regular cluster that fits the line: go on
          clusters.moveTo(cluster);
        }
        cluster = new Stretch(new GlyphPos(runIndex, posIndex), index, new Metrics(run.font));
      });
    });

    //document.body.appendChild(document.createElement('pre')).innerHTML = syntaxHighlight(textLayout.#Lines);
    textLayout.fLines.forEach(function(line, lineIndex) {
      const text = inputs.text.substring(line.text.start, line.text.end);
      document.body.appendChild(document.createElement('pre')).innerHTML += text + "\n";
    });
  }
}