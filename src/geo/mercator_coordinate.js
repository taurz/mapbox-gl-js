// @flow

import LngLat, {earthRadius} from '../geo/lng_lat';
import type {LngLatLike} from '../geo/lng_lat';
import type {LngLatBoundsLike} from './lng_lat_bounds';
import LngLatBounds from './lng_lat_bounds';

/*
 * The average circumference of the world in meters.
 */
const earthCircumfrence = 2 * Math.PI * earthRadius; // meters

/*
 * The circumference at a line of latitude in meters.
 */
function circumferenceAtLatitude(latitude: number) {
    return earthCircumfrence * Math.cos(latitude * Math.PI / 180);
}

export function mercatorXfromLng(lng: number, bounds?: LngLatBoundsLike) {
    if (bounds) {
        const b = LngLatBounds.convert(bounds);
        return (lng - b.getWest()) / (b.getEast() - b.getWest());
    }
    return (180 + lng) / 360;
}

export function mercatorYfromLat(lat: number, bounds?: LngLatBoundsLike) {
    if (bounds) {
        const b = LngLatBounds.convert(bounds);
        return (b.getNorth() - lat) / (b.getNorth() - b.getSouth());
    }
    return (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360;
}

export function mercatorZfromAltitude(altitude: number, lat: number, bounds?: LngLatBoundsLike) {
    if (bounds) {
        const b = LngLatBounds.convert(bounds);
        return altitude / (b.getNorth() - lat);
    }
    return altitude / circumferenceAtLatitude(lat);
}

export function lngFromMercatorX(x: number, bounds?: LngLatBoundsLike) {
    if (bounds) {
        const b = LngLatBounds.convert(bounds);
        return x * (b.getEast() - b.getWest()) + b.getWest();
    }
    return x * 360 - 180;
}

export function latFromMercatorY(y: number, bounds?: LngLatBoundsLike) {
    if (bounds) {
        const b = LngLatBounds.convert(bounds);
        const lat = b.getNorth() - y * (b.getNorth() - b.getSouth());
        return lat;
    }
    const y2 = 180 - y * 360;
    return 360 / Math.PI * Math.atan(Math.exp(y2 * Math.PI / 180)) - 90;
}

export function altitudeFromMercatorZ(z: number, y: number, bounds?: LngLatBoundsLike) {
    if (bounds) {
        const b = LngLatBounds.convert(bounds);
        return z * (b.getNorth() - y);
    }
    return z * circumferenceAtLatitude(latFromMercatorY(y));
}

/**
 * Determine the Mercator scale factor for a given latitude, see
 * https://en.wikipedia.org/wiki/Mercator_projection#Scale_factor
 *
 * At the equator the scale factor will be 1, which increases at higher latitudes.
 *
 * @param {number} lat Latitude
 * @returns {number} scale factor
 * @private
 */
export function mercatorScale(lat: number) {
    return 1 / Math.cos(lat * Math.PI / 180);
}

/**
 * A `MercatorCoordinate` object represents a projected three dimensional position.
 *
 * `MercatorCoordinate` uses the web mercator projection ([EPSG:3857](https://epsg.io/3857)) with slightly different units:
 * - the size of 1 unit is the width of the projected world instead of the "mercator meter"
 * - the origin of the coordinate space is at the north-west corner instead of the middle
 *
 * For example, `MercatorCoordinate(0, 0, 0)` is the north-west corner of the mercator world and
 * `MercatorCoordinate(1, 1, 0)` is the south-east corner. If you are familiar with
 * [vector tiles](https://github.com/mapbox/vector-tile-spec) it may be helpful to think
 * of the coordinate space as the `0/0/0` tile with an extent of `1`.
 *
 * The `z` dimension of `MercatorCoordinate` is conformal. A cube in the mercator coordinate space would be rendered as a cube.
 *
 * @param {number} x The x component of the position.
 * @param {number} y The y component of the position.
 * @param {number} z The z component of the position.
 * @example
 * var nullIsland = new mapboxgl.MercatorCoordinate(0.5, 0.5, 0);
 *
 * @see [Add a custom style layer](https://www.mapbox.com/mapbox-gl-js/example/custom-style-layer/)
 */
class MercatorCoordinate {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number = 0) {
        this.x = +x;
        this.y = +y;
        this.z = +z;
    }

    /**
     * Project a `LngLat` to a `MercatorCoordinate`.
     *
     * @param {LngLatLike} lngLatLike The location to project.
     * @param {number} altitude The altitude in meters of the position.
     * @param {LngLatBoundsLike} bounds layer bounds
     * @returns {MercatorCoordinate} The projected mercator coordinate.
     * @example
     * var coord = mapboxgl.MercatorCoordinate.fromLngLat({ lng: 0, lat: 0}, 0);
     * coord; // MercatorCoordinate(0.5, 0.5, 0)
     */
    static fromLngLat(lngLatLike: LngLatLike, altitude: number = 0, bounds?: LngLatBoundsLike) {
        const lngLat = LngLat.convert(lngLatLike);

        return new MercatorCoordinate(
                mercatorXfromLng(lngLat.lng, bounds),
                mercatorYfromLat(lngLat.lat, bounds),
                mercatorZfromAltitude(altitude, lngLat.lat, bounds));
    }

    /**
     * Returns the `LngLat` for the coordinate.
     * @param {LngLatBoundsLike} bounds layer bounds
     * @returns {LngLat} The `LngLat` object.
     * @example
     * var coord = new mapboxgl.MercatorCoordinate(0.5, 0.5, 0);
     * var lngLat = coord.toLngLat(); // LngLat(0, 0)
     */
    toLngLat(bounds?: LngLatBoundsLike) {
        return new LngLat(
                lngFromMercatorX(this.x, bounds),
                latFromMercatorY(this.y, bounds));
    }

    /**
     * Returns the altitude in meters of the coordinate.
     * @param {LngLatBoundsLike} bounds layer bounds
     * @returns {number} The altitude in meters.
     * @example
     * var coord = new mapboxgl.MercatorCoordinate(0, 0, 0.02);
     * coord.toAltitude(); // 6914.281956295339
     */
    toAltitude(bounds?: LngLatBoundsLike) {
        return altitudeFromMercatorZ(this.z, this.y, bounds);
    }

    /**
     * Returns the distance of 1 meter in `MercatorCoordinate` units at this latitude.
     *
     * For coordinates in real world units using meters, this naturally provides the scale
     * to transform into `MercatorCoordinate`s.
     * @param {LngLatBoundsLike} bounds layer bounds
     * @returns {number} Distance of 1 meter in `MercatorCoordinate` units.
     */
    meterInMercatorCoordinateUnits(bounds?: LngLatBoundsLike) {
        // 1 meter / circumference at equator in meters * Mercator projection scale factor at this latitude
        return 1 / earthCircumfrence * mercatorScale(latFromMercatorY(this.y, bounds));
    }

}

export default MercatorCoordinate;
