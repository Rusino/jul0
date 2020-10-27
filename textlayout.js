var CodeUnitFlagsEnum;
(function (CodeUnitFlagsEnum) {
    CodeUnitFlagsEnum[CodeUnitFlagsEnum["kNoCodeUnitFlag"] = 0] = "kNoCodeUnitFlag";
    CodeUnitFlagsEnum[CodeUnitFlagsEnum["kPartOfWhiteSpace"] = 1] = "kPartOfWhiteSpace";
    CodeUnitFlagsEnum[CodeUnitFlagsEnum["kGraphemeStart"] = 2] = "kGraphemeStart";
    CodeUnitFlagsEnum[CodeUnitFlagsEnum["kSoftLineBreakBefore"] = 4] = "kSoftLineBreakBefore";
    CodeUnitFlagsEnum[CodeUnitFlagsEnum["kHardLineBreakBefore"] = 8] = "kHardLineBreakBefore";
})(CodeUnitFlagsEnum || (CodeUnitFlagsEnum = {}));
;
var LineBreakTypeEnum;
(function (LineBreakTypeEnum) {
    LineBreakTypeEnum[LineBreakTypeEnum["kSortLineBreakBefore"] = 0] = "kSortLineBreakBefore";
    LineBreakTypeEnum[LineBreakTypeEnum["kHardLineBreakBefore"] = 1] = "kHardLineBreakBefore";
})(LineBreakTypeEnum || (LineBreakTypeEnum = {}));
;
var GlyphPos = /** @class */ (function () {
    function GlyphPos(runIndex, glyphIndex) {
        this.runIndex = runIndex;
        this.glyphIndex = glyphIndex;
    }
    return GlyphPos;
}());
var TextRange = /** @class */ (function () {
    function TextRange(start, end) {
        this.start = start;
        this.end = end;
    }
    TextRange.prototype.width = function () {
        return this.end - this.start;
    };
    TextRange.prototype.clean = function () {
        this.start = 0;
        this.end = 0;
    };
    TextRange.prototype.isEmpty = function () {
        return this.end === this.start;
    };
    TextRange.prototype.merge = function (tail) {
        console.assert(this.end === tail.start);
        this.start = Math.min(this.start, tail.start);
        this.end = Math.max(this.end, tail.end);
    };
    return TextRange;
}());
var Metrics = /** @class */ (function () {
    function Metrics(font) {
        if (font) {
            this.ascent = font.metrics.ascent;
            this.descent = font.metrics.descent;
            this.leading = font.metrics.descent;
        }
    }
    Metrics.prototype.merge = function (tail) {
        if (typeof (tail) === "undefined") {
            return;
        }
        this.ascent = Math.min(this.ascent, tail.ascent);
        this.descent = Math.max(this.descent, tail.descent);
        this.leading = Math.max(this.leading, tail.leading);
    };
    Metrics.prototype.clean = function () {
        this.ascent = 0;
        this.descent = 0;
        this.leading = 0;
    };
    return Metrics;
}());
var Stretch = /** @class */ (function () {
    function Stretch(glyphStart, textIndex, metrics) {
        this.empty = true;
        if (glyphStart == undefined) {
            this.empty = true;
            this.width = 0.0;
        }
        else {
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
    Stretch.prototype.isEmpty = function () {
        return this.empty ||
            (this.glyphStart.runIndex === this.glyphEnd.runIndex &&
                this.glyphEnd.glyphIndex === this.glyphStart.glyphIndex);
    };
    Stretch.prototype.clean = function () {
        this.empty = true;
        this.glyphStart = undefined;
        this.glyphEnd = undefined;
        this.textRange = undefined;
        this.metrics = undefined;
        this.width = 0.0;
    };
    Stretch.prototype.moveTo = function (tail) {
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
    };
    Stretch.prototype.finish = function (glyphIndex, textIndex, width) {
        this.textRange.end = textIndex;
        this.glyphEnd.glyphIndex = glyphIndex;
        this.width = width;
    };
    return Stretch;
}());
var Line = /** @class */ (function () {
    function Line(stretch, spaces) {
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
    return Line;
}());
var TextLayout = /** @class */ (function () {
    function TextLayout() {
        this.fLines = new Array(0);
    }
    TextLayout.prototype.shape = function () { };
    TextLayout.prototype.measure = function (width) { };
    TextLayout.prototype.paint = function (x, y) { };
    TextLayout.prototype.hasProperty = function (index, flag) {
        return (this.fCodeUnitProperties[index] & flag) === flag;
    };
    TextLayout.prototype.isHardLineBreak = function (index) {
        return this.hasProperty(index, CodeUnitFlagsEnum.kHardLineBreakBefore);
    };
    TextLayout.prototype.isSoftLineBreak = function (index) {
        return this.hasProperty(index, CodeUnitFlagsEnum.kSoftLineBreakBefore);
    };
    TextLayout.prototype.isWhitespaces = function (stretch) {
        if (stretch.textRange.width() > 0) {
            for (var i = stretch.textRange.start; i < stretch.textRange.end; ++i) {
                if (!this.hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
                    return false;
                }
            }
        }
        else if (stretch.textRange.width() < 0) {
            for (var i = stretch.textRange.start; i > stretch.textRange.end; --i) {
                if (!this.hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
                    return false;
                }
            }
        }
        return true;
    };
    TextLayout.prototype.computeCodeUnitProperties = function (inputs) {
        var textLayout = this;
        this.fCodeUnitProperties =
            new Array(10).fill(null).map(function () { return CodeUnitFlagsEnum.kNoCodeUnitFlag; });
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
    };
    TextLayout.prototype.addLine = function (stretch, spaces) {
        this.fLines.push(new Line(stretch, spaces));
        stretch.clean();
        spaces.clean();
    };
    TextLayout.prototype.breakShapedTextIntoLines = function (inputs, lineMax) {
        // line : spaces : clusters
        var textLayout = this;
        var line = new Stretch();
        var spaces = new Stretch();
        var clusters = new Stretch();
        inputs.runs.forEach(function (run, runIndex) {
            var cluster = null;
            run.clusters.forEach(function (textIndex, glyphIndex) {
                if (!cluster) {
                    cluster = new Stretch(new GlyphPos(runIndex, glyphIndex), textIndex, new Metrics(run.font));
                    return;
                }
                else if (cluster.textRange.start == textIndex) {
                    return;
                }
                console.assert(cluster.glyphStart.runIndex === runIndex, "The entire cluster belongs to a single run");
                var width = run.positions[glyphIndex].x - run.positions[cluster.glyphStart.glyphIndex].x;
                cluster.finish(glyphIndex, textIndex, width);
                var isHardLineBreak = textLayout.isHardLineBreak(cluster.textRange.start);
                var isSoftLineBreak = textLayout.isSoftLineBreak(cluster.textRange.start);
                var isWhitespaces = textLayout.isWhitespaces(cluster);
                var isEndOfText = textIndex === inputs.text.length;
                if (isHardLineBreak || isEndOfText || isSoftLineBreak || isWhitespaces) {
                    if (!clusters.isEmpty()) {
                        line.moveTo(spaces);
                        line.moveTo(clusters);
                    }
                    if (isWhitespaces) {
                        spaces.moveTo(cluster);
                    }
                    if (isEndOfText) {
                        line.moveTo(cluster);
                    }
                }
                if (isHardLineBreak) {
                    textLayout.addLine(line, spaces);
                    return;
                }
                else if (isEndOfText) {
                    if (!line.isEmpty()) {
                        textLayout.addLine(line, spaces);
                    }
                    return;
                }
                if ((line.width + spaces.width + clusters.width + cluster.width) <= lineMax) {
                    clusters.moveTo(cluster);
                }
                else {
                    // Wrapping the text by whitespaces
                    if (line.isEmpty()) {
                        if (clusters.isEmpty()) {
                            line.moveTo(cluster);
                        }
                        else {
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
        textLayout.fLines.forEach(function (line, lineIndex) {
            var text = inputs.text.substring(line.text.start, line.text.end);
            document.body.appendChild(document.createElement('pre')).innerHTML += text + "\n";
        });
    };
    return TextLayout;
}());
//# sourceMappingURL=textlayout.js.map