import type {ITiledMap, ITiledMapLayer, ITiledMapLayerProperty} from "../Map/ITiledMap";
import { flattenGroupLayersMap } from "../Map/LayersFlattener";
import TilemapLayer = Phaser.Tilemaps.TilemapLayer;
import { DEPTH_OVERLAY_INDEX } from "./DepthIndexes";

export type PropertyChangeCallback = (newValue: string | number | boolean | undefined, oldValue: string | number | boolean | undefined, allProps: Map<string, string | boolean | number>) => void;

/**
 * A wrapper around a ITiledMap interface to provide additional capabilities.
 * It is used to handle layer properties.
 */
export class GameMap {
    private key: number | undefined;
    private lastProperties = new Map<string, string | boolean | number>();
    private callbacks = new Map<string, Array<PropertyChangeCallback>>();

    private tileSetPropertyMap: { [tile_index: number]: Array<ITiledMapLayerProperty> } = {}
    public readonly flatLayers: ITiledMapLayer[];
    public readonly phaserLayers: TilemapLayer[] = [];

    public exitUrls: Array<string> = []

    public constructor(private map: ITiledMap, phaserMap: Phaser.Tilemaps.Tilemap, terrains: Array<Phaser.Tilemaps.Tileset>) {
        this.flatLayers = flattenGroupLayersMap(map);
        let depth = -2;
        for (const layer of this.flatLayers) {
            if(layer.type === 'tilelayer'){
                this.phaserLayers.push(phaserMap.createLayer(layer.name, terrains, 0, 0).setDepth(depth));
            }
            if (layer.type === 'objectgroup' && layer.name === 'floorLayer') {
                depth = DEPTH_OVERLAY_INDEX;
            }
        }
        for (const tileset of map.tilesets) {
            tileset?.tiles?.forEach(tile => {
                if (tile.properties) {
                    this.tileSetPropertyMap[tileset.firstgid + tile.id] = tile.properties
                    tile.properties.forEach(prop => {
                        if (prop.name == "exitUrl" && typeof prop.value == "string") {
                            this.exitUrls.push(prop.value);
                        }
                    })
                }
            })
        }
    }



    /**
     * Sets the position of the current player (in pixels)
     * This will trigger events if properties are changing.
     */
    public setPosition(x: number, y: number) {
        const xMap = Math.floor(x / this.map.tilewidth);
        const yMap = Math.floor(y / this.map.tileheight);
        const key = xMap + yMap * this.map.width;
        if (key === this.key) {
            return;
        }
        this.key = key;

        const newProps = this.getProperties(key);
        const oldProps = this.lastProperties;
        this.lastProperties = newProps;

        // Let's compare the 2 maps:
        // First new properties vs oldProperties
        for (const [newPropName, newPropValue] of newProps.entries()) {
            const oldPropValue = oldProps.get(newPropName);
            if (oldPropValue !== newPropValue) {
                this.trigger(newPropName, oldPropValue, newPropValue, newProps);
            }
        }

        for (const [oldPropName, oldPropValue] of oldProps.entries()) {
            if (!newProps.has(oldPropName)) {
                // We found a property that disappeared
                this.trigger(oldPropName, oldPropValue, undefined, newProps);
            }
        }
    }

    public getCurrentProperties(): Map<string, string | boolean | number> {
        return this.lastProperties;
    }

    private getProperties(key: number): Map<string, string | boolean | number> {
        const properties = new Map<string, string | boolean | number>();

        for (const layer of this.flatLayers) {
            if (layer.type !== 'tilelayer') {
                continue;
            }

            let tileIndex: number | undefined = undefined;
            if (layer.data) {
                const tiles = layer.data as number[];
                if (tiles[key] == 0) {
                    continue;
                }
                tileIndex = tiles[key]
            }

            // There is a tile in this layer, let's embed the properties
            if (layer.properties !== undefined) {
                for (const layerProperty of layer.properties) {
                    if (layerProperty.value === undefined) {
                        continue;
                    }
                    properties.set(layerProperty.name, layerProperty.value);
                }
            }

            if (tileIndex) {
                this.tileSetPropertyMap[tileIndex]?.forEach(property => {
                    if (property.value) {
                        properties.set(property.name, property.value)
                    } else if (properties.has(property.name)) {
                        properties.delete(property.name)
                    }
                })
            }
        }

        return properties;
    }

    public getMap(): ITiledMap{
        return this.map;
    }

    private trigger(propName: string, oldValue: string | number | boolean | undefined, newValue: string | number | boolean | undefined, allProps: Map<string, string | boolean | number>) {
        const callbacksArray = this.callbacks.get(propName);
        if (callbacksArray !== undefined) {
            for (const callback of callbacksArray) {
                callback(newValue, oldValue, allProps);
            }
        }
    }

    /**
     * Registers a callback called when the user moves to a tile where the property propName is different from the last tile the user was on.
     */
    public onPropertyChange(propName: string, callback: PropertyChangeCallback) {
        let callbacksArray = this.callbacks.get(propName);
        if (callbacksArray === undefined) {
            callbacksArray = new Array<PropertyChangeCallback>();
            this.callbacks.set(propName, callbacksArray);
        }
        callbacksArray.push(callback);
    }

    public findLayer(layerName: string): ITiledMapLayer | undefined {
        return this.flatLayers.find((layer) => layer.name === layerName);
    }

    public findPhaserLayer(layerName: string): TilemapLayer | undefined {
        return this.phaserLayers.find((layer) => layer.layer.name === layerName);
    }

    public addTerrain(terrain : Phaser.Tilemaps.Tileset): void {
        for (const phaserLayer of this.phaserLayers) {
            phaserLayer.tileset.push(terrain);
        }
    }

}
