// @flow
"use strict";

import Point from "@mapbox/point-geometry";

function VectorTileFeature(pbf, end, extent, keys, values) {
    // Public
    this.properties = {};
    this.extent = extent;
    this.type = 0;

    // Private
    this._pbf = pbf;
    this._geometry = -1;
    this._keys = keys;
    this._values = values;

    pbf.readFields(readFeature, this, end);
}

function readFeature(tag, feature, pbf) {
    if (tag == 1) feature.id = pbf.readVarint();
    else if (tag == 2) readTag(pbf, feature);
    else if (tag == 3) feature.type = pbf.readVarint();
    else if (tag == 4) feature._geometry = pbf.pos;
}

function readTag(pbf, feature) {
    const end = pbf.readVarint() + pbf.pos;

    while (pbf.pos < end) {
        const key = feature._keys[pbf.readVarint()],
            value = feature._values[pbf.readVarint()];
        feature.properties[key] = value;
    }
}

VectorTileFeature.types = ["Unknown", "Point", "LineString", "Polygon"];

VectorTileFeature.prototype.loadGeometry = function () {
    const pbf = this._pbf;
    pbf.pos = this._geometry;

    let end = pbf.readVarint() + pbf.pos,
        cmd = 1,
        length = 0,
        x = 0,
        y = 0,
        lines = [],
        line;

    while (pbf.pos < end) {
        if (length <= 0) {
            const cmdLen = pbf.readVarint();
            cmd = cmdLen & 0x7;
            length = cmdLen >> 3;
        }

        length--;

        if (cmd === 1 || cmd === 2) {
            x += pbf.readSVarint();
            y += pbf.readSVarint();

            if (cmd === 1) {
                // moveTo
                if (line) lines.push(line);
                line = [];
            }

            line.push(new Point(x, y));
        } else if (cmd === 7) {
            // Workaround for https://github.com/mapbox/mapnik-vector-tile/issues/90
            if (line) {
                line.push(line[0].clone()); // closePolygon
            }
        } else {
            throw new Error(`unknown command ${cmd}`);
        }
    }

    if (line) lines.push(line);

    return lines;
};

VectorTileFeature.prototype.bbox = function () {
    const pbf = this._pbf;
    pbf.pos = this._geometry;

    let end = pbf.readVarint() + pbf.pos,
        cmd = 1,
        length = 0,
        x = 0,
        y = 0,
        x1 = Infinity,
        x2 = -Infinity,
        y1 = Infinity,
        y2 = -Infinity;

    while (pbf.pos < end) {
        if (length <= 0) {
            const cmdLen = pbf.readVarint();
            cmd = cmdLen & 0x7;
            length = cmdLen >> 3;
        }

        length--;

        if (cmd === 1 || cmd === 2) {
            x += pbf.readSVarint();
            y += pbf.readSVarint();
            if (x < x1) x1 = x;
            if (x > x2) x2 = x;
            if (y < y1) y1 = y;
            if (y > y2) y2 = y;
        } else if (cmd !== 7) {
            throw new Error(`unknown command ${cmd}`);
        }
    }

    return [x1, y1, x2, y2];
};

VectorTileFeature.prototype.toGeoJSON = function (x, y, z, bounds) {
    let size = this.extent * Math.pow(2, z),
        x0 = this.extent * x,
        y0 = this.extent * y,
        coords = this.loadGeometry(),
        type = VectorTileFeature.types[this.type],
        i,
        j;

    function mercatorProject(line) {
        for (let j = 0; j < line.length; j++) {
            const p = line[j],
                y2 = 180 - ((p.y + y0) * 360) / size;
            line[j] = [
                ((p.x + x0) * 360) / size - 180,
                (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) -
                    90,
            ];
        }
    }

    function gaussProject(line, bounds) {
        for (let j = 0; j < line.length; j++) {
            const p = line[j],
                width = bounds.getEast() - bounds.getWest(),
                height = bounds.getNorth() - bounds.getSouth();
            line[j] = [
                ((p.x + x0) / size) * width + bounds.getWest(),
                bounds.getNorth() - ((p.y + y0) / size) * height,
            ];
        }
    }

    const project = bounds ? gaussProject.bind(null, bounds) : mercatorProject;

    switch (this.type) {
    case 1:
        var points = [];
        for (i = 0; i < coords.length; i++) {
            points[i] = coords[i][0];
        }
        coords = points;
        project(coords);
        break;

    case 2:
        for (i = 0; i < coords.length; i++) {
            project(coords[i]);
        }
        break;

    case 3:
        coords = classifyRings(coords);
        for (i = 0; i < coords.length; i++) {
            for (j = 0; j < coords[i].length; j++) {
                project(coords[i][j]);
            }
        }
        break;
    }

    if (coords.length === 1) {
        coords = coords[0];
    } else {
        type = `Multi${type}`;
    }

    const result = {
        type: "Feature",
        geometry: {
            type,
            coordinates: coords,
        },
        properties: this.properties,
    };

    if ("id" in this) {
        result.id = this.id;
    }

    return result;
};

// classifies an array of rings into polygons with outer rings and holes

function classifyRings(rings) {
    const len = rings.length;

    if (len <= 1) return [rings];

    let polygons = [],
        polygon,
        ccw;

    for (let i = 0; i < len; i++) {
        const area = signedArea(rings[i]);
        if (area === 0) continue;

        if (ccw === undefined) ccw = area < 0;

        if (ccw === area < 0) {
            if (polygon) polygons.push(polygon);
            polygon = [rings[i]];
        } else {
            polygon.push(rings[i]);
        }
    }
    if (polygon) polygons.push(polygon);

    return polygons;
}

function signedArea(ring) {
    let sum = 0;
    // eslint-disable-next-line no-var
    for (var i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
        p1 = ring[i];
        p2 = ring[j];
        sum += (p2.x - p1.x) * (p1.y + p2.y);
    }
    return sum;
}

export default VectorTileFeature;
