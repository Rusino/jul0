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
    TextLayout.prototype.measure = function (width) { };
    TextLayout.prototype.paint = function (x, y) { };
    TextLayout.prototype.hasProperty = function (index, flag) {
        return (this.fCodeUnitProperties[index] & flag) === flag;
    };
    TextLayout.prototype.isWhitespaces = function (stretch) {
        for (var i = stretch.textRange.start; i < stretch.textRange.end; ++i) {
            if (!this.hasProperty(i, CodeUnitFlagsEnum.kPartOfWhiteSpace)) {
                return false;
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
    // Add textDirection
    TextLayout.prototype.breakShapedTextIntoLines = function (inputs, lineMax) {
        // line : spaces : clusters
        var line = new Stretch();
        var spaces = new Stretch();
        var clusters = new Stretch();
        // Iterate through all the runs
        var textLayout = this;
        inputs.runs.forEach(function (run, runIndex) {
            var cluster = null;
            // Iterate through all glyphs in the run
            run.positions.forEach(function (pos, posIndex) {
                var index = run.clusters[posIndex];
                if (!cluster) {
                    // First cluster in the run
                    cluster = new Stretch(new GlyphPos(runIndex, posIndex), index, new Metrics(run.font));
                    return;
                }
                else if (cluster.textRange.start === index) {
                    // Skip all the glyphs of the same cluster
                    return;
                }
                // Finish the cluster
                console.assert(cluster.glyphStart.runIndex === runIndex);
                cluster.textRange.end = index;
                cluster.glyphEnd = new GlyphPos(runIndex, posIndex);
                cluster.width = pos.x - run.positions[cluster.glyphStart.glyphIndex].x;
                var isHardLineBreak = textLayout.hasProperty(cluster.textRange.start, CodeUnitFlagsEnum.kHardLineBreakBefore);
                var isSoftLineBreak = textLayout.hasProperty(cluster.textRange.start, CodeUnitFlagsEnum.kSoftLineBreakBefore);
                var isWhitespaces = textLayout.isWhitespaces(cluster);
                var isEndOfText = posIndex === run.positions.length - 1;
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
                }
                else if (isEndOfText) {
                    line.moveTo(cluster);
                    if (!line.isEmpty()) {
                        textLayout.addLine(line, spaces);
                    }
                    return;
                }
                else if (isWhitespaces) {
                    // We don't have to add a line - whitespaces get trimmed at the end of the line
                    if (line.isEmpty()) {
                        // Ignore the space at the beginning of the line
                    }
                    else {
                        console.assert(spaces.isEmpty() && clusters.isEmpty());
                        spaces.moveTo(cluster);
                    }
                }
                else if ((line.width + spaces.width + clusters.width + cluster.width) > lineMax) {
                    var lineText = line.isEmpty() ? "[]" : inputs.text.substring(line.textRange.start, line.textRange.end);
                    var clustersText = clusters.isEmpty() ? "[]" : inputs.text.substring(clusters.textRange.start, clusters.textRange.end);
                    var clusterText = cluster.isEmpty() ? "[]" : inputs.text.substring(cluster.textRange.start, cluster.textRange.end);
                    console.log("line:     '" + lineText + "' " + spaces.width + "\n");
                    console.log("clusters: '" + clustersText + "'\n");
                    console.log("cluster:  '" + clusterText + "'\n");
                    // The cluster does not fit the line
                    if (!line.isEmpty()) {
                        // Add what we have on the line
                        clusters.moveTo(cluster);
                    }
                    else if (!clusters.isEmpty()) {
                        // The word does not fit the line; add as many clusters as we can
                        line.moveTo(clusters);
                        clusters.moveTo(cluster);
                    }
                    else {
                        // The cluster does not fit the line anyway; add it clipped
                        line.moveTo(cluster);
                    }
                    textLayout.addLine(line, spaces);
                }
                else {
                    // A regular cluster that fits the line: go on
                    clusters.moveTo(cluster);
                }
                cluster = new Stretch(new GlyphPos(runIndex, posIndex), index, new Metrics(run.font));
            });
        });
        //document.body.appendChild(document.createElement('pre')).innerHTML = syntaxHighlight(textLayout.#Lines);
        textLayout.fLines.forEach(function (line, lineIndex) {
            var text = inputs.text.substring(line.text.start, line.text.end);
            document.body.appendChild(document.createElement('pre')).innerHTML += text + "\n";
        });
    };
    return TextLayout;
}());
//# sourceMappingURL=textlayout.js.map