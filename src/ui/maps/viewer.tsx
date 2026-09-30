import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "../../storage/database";
import {
  clampPoint,
  insideMap,
  latLngToPoint,
  pointToLatLng,
  type MapAsset,
  type MapLocation,
  type MapPoint,
} from "../../domain/maps";
import { mapIconId } from "./catalog";

export interface ViewerHandle {
  zoom: (delta: number) => void;
  fit: () => void;
  focus: (point: MapPoint) => void;
  center: () => MapPoint;
}
// Campaign places may be secret: only masters receive them, drawn apart.
type Place = MapLocation & { secret?: boolean };
interface Props {
  asset: MapAsset;
  locations: Place[];
  selectedId?: string;
  mode: "browse" | "add" | "move";
  moving?: { location: MapLocation; point: MapPoint };
  onSelect: (location: MapLocation) => void;
  onPlace: (point: MapPoint) => void;
  onMove: (point: MapPoint) => void;
}

class AtlasLayer extends L.GridLayer {
  private urls = new Map<HTMLElement, string>();
  private disposed = new WeakSet<HTMLElement>();
  constructor(
    private asset: MapAsset,
    private failure: () => void,
  ) {
    // Negative view zooms still use level zero tiles; GridLayer's default minZoom
    // of zero would otherwise hide the image when fitting it on a small screen.
    super({
      tileSize: 512,
      noWrap: true,
      keepBuffer: 1,
      minZoom: -10,
      maxZoom: asset.maxZoom + 2,
      minNativeZoom: 0,
      maxNativeZoom: asset.maxZoom,
      bounds: [
        pointToLatLng({ x: 0, y: 1 }, asset),
        pointToLatLng({ x: 1, y: 0 }, asset),
      ],
    });
    this.on("tileunload", (event: L.TileEvent) => {
      this.disposed.add(event.tile);
      const url = this.urls.get(event.tile);
      if (url) URL.revokeObjectURL(url);
      this.urls.delete(event.tile);
    });
  }
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement("div");
    const img = document.createElement("img");
    const scale = 2 ** (this.asset.maxZoom - coords.z);
    img.width = Math.min(
      512,
      Math.ceil(this.asset.width / scale) - coords.x * 512,
    );
    img.height = Math.min(
      512,
      Math.ceil(this.asset.height / scale) - coords.y * 512,
    );
    img.alt = "";
    img.draggable = false;
    tile.append(img);
    const fail = () => {
      if (!this.disposed.has(tile)) {
        done(new Error("Imagem indisponível."), tile);
        this.failure();
      }
    };
    img.onload = () => {
      if (!this.disposed.has(tile)) done(undefined, tile);
    };
    img.onerror = fail;
    if (this.asset.kind === "bundled")
      img.src = `${this.asset.baseUrl}/${coords.z}/${coords.x}/${coords.y}.webp`;
    else
      void db.mapTiles
        .get([this.asset.id, coords.z, coords.x, coords.y])
        .then((record) => {
          if (this.disposed.has(tile)) return;
          if (!record) {
            fail();
            return;
          }
          const url = URL.createObjectURL(record.blob);
          this.urls.set(tile, url);
          img.src = url;
        })
        .catch(fail);
    return tile;
  }
  release() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
function icon(
  location: Pick<Place, "iconId" | "secret">,
  selected = false,
  moving = false,
) {
  // Only a catalog-owned symbol enters the SVG; user text is assigned via DOM APIs.
  return L.divIcon({
    className: `atlas-pin${selected ? " selected" : ""}${moving ? " moving" : ""}${location.secret ? " secret" : ""}`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<span><svg width="25" height="25" viewBox="0 0 512 512" aria-hidden="true"><use href="/art/entity-icons.svg#${mapIconId(location.iconId)}" /></svg></span>`,
  });
}
export const MapViewer = forwardRef<ViewerHandle, Props>(
  function MapViewer(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<AtlasLayer | null>(null);
    const markers = useRef(
      new Map<string, { marker: L.Marker; signature: string }>(),
    );
    const movingMarker = useRef<L.Marker | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const refreshMarkers = useRef<() => void>(() => {});
    const fit = useRef<() => void>(() => {});
    const [error, setError] = useState(false);
    useImperativeHandle(
      ref,
      () => ({
        zoom: (delta) =>
          map.current?.setZoom(map.current.getZoom() + delta, {
            animate: false,
          }),
        fit: () => fit.current(),
        focus: (point) => {
          if (map.current)
            map.current.panTo(pointToLatLng(point, latest.current.asset));
        },
        center: () => {
          const center = map.current?.getCenter();
          return center
            ? clampPoint(
                latLngToPoint(center.lat, center.lng, latest.current.asset),
              )
            : { x: 0.5, y: 0.5 };
        },
      }),
      [],
    );

    useEffect(() => {
      const element = host.current!;
      const asset = latest.current.asset;
      setError(false);
      const bounds = L.latLngBounds(
        pointToLatLng({ x: 0, y: 1 }, asset),
        pointToLatLng({ x: 1, y: 0 }, asset),
      );
      const animate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      const instance = L.map(element, {
        crs: L.CRS.Simple,
        zoomControl: false,
        attributionControl: false,
        minZoom: -5,
        maxZoom: asset.maxZoom + 2,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 100,
        touchZoom: true,
        bounceAtZoomLimits: false,
        doubleClickZoom: false,
        maxBounds: bounds.pad(0.35),
        maxBoundsViscosity: 0.8,
        zoomAnimation: animate,
        fadeAnimation: animate,
        markerZoomAnimation: animate,
      });
      map.current = instance;
      const tiles = new AtlasLayer(asset, () => setError(true));
      layer.current = tiles;
      tiles.addTo(instance);
      fit.current = () =>
        instance.fitBounds(bounds, { padding: [12, 12], animate: false });
      fit.current();
      let suppressClickUntil = 0;
      const touchStart = (event: TouchEvent) => {
        if (event.touches.length > 1) suppressClickUntil = Date.now() + 1000;
      };
      const touchEnd = () => {
        if (suppressClickUntil > Date.now())
          suppressClickUntil = Date.now() + 500;
      };
      element.addEventListener("touchstart", touchStart, { passive: true });
      element.addEventListener("touchend", touchEnd, { passive: true });
      instance.on("dragstart zoomstart", () => {
        suppressClickUntil = Date.now() + 500;
      });
      instance.on("dragend zoomend", () => {
        suppressClickUntil = Date.now() + 200;
      });
      instance.on("click", (event: L.LeafletMouseEvent) => {
        if (Date.now() < suppressClickUntil) return;
        const current = latest.current;
        const point = latLngToPoint(event.latlng.lat, event.latlng.lng, asset);
        if (!insideMap(point)) return;
        if (current.mode === "add") current.onPlace(point);
        if (current.mode === "move") current.onMove(point);
      });
      refreshMarkers.current = () => {
        const current = latest.current;
        const visible = instance.getBounds().pad(0.4);
        const retained = new Set<string>();
        for (const location of current.locations) {
          if (current.moving?.location.id === location.id) continue;
          const position = pointToLatLng(location, asset);
          if (!visible.contains(position)) continue;
          retained.add(location.id);
          const signature = `${location.revision}:${location.name}:${location.iconId}:${location.x}:${location.y}:${!!location.secret}:${current.selectedId === location.id}`;
          let record = markers.current.get(location.id);
          if (!record) {
            const marker = L.marker(position, {
              icon: icon(location, current.selectedId === location.id),
              title: location.name,
              alt: location.name,
              keyboard: true,
              bubblingMouseEvents: false,
              riseOnHover: true,
            });
            marker.on("click", () => {
              const value = latest.current.locations.find(
                (item) => item.id === location.id,
              );
              if (value && latest.current.mode === "browse")
                latest.current.onSelect(value);
            });
            marker.addTo(instance);
            record = { marker, signature };
            markers.current.set(location.id, record);
          } else if (record.signature !== signature) {
            record.marker
              .setLatLng(position)
              .setIcon(icon(location, current.selectedId === location.id));
            record.signature = signature;
          }
          const pin = record.marker.getElement();
          pin?.setAttribute("aria-label", location.name);
          pin?.setAttribute("title", location.name);
        }
        for (const [id, record] of markers.current)
          if (!retained.has(id)) {
            record.marker.remove();
            markers.current.delete(id);
          }
        element.dataset.zoom = String(instance.getZoom());
        const center = instance.getCenter();
        element.dataset.center = `${center.lat},${center.lng}`;
      };
      instance.on("moveend zoomend", () => refreshMarkers.current());
      refreshMarkers.current();
      const resize = new ResizeObserver(() => {
        const center = instance.getCenter();
        instance.invalidateSize({ pan: false });
        instance.setMinZoom(Math.min(0, instance.getBoundsZoom(bounds)) - 0.5);
        instance.panTo(center, { animate: false });
        refreshMarkers.current();
      });
      resize.observe(element);
      return () => {
        resize.disconnect();
        element.removeEventListener("touchstart", touchStart);
        element.removeEventListener("touchend", touchEnd);
        markers.current.clear();
        movingMarker.current = null;
        instance.remove();
        tiles.release();
        map.current = null;
        layer.current = null;
        refreshMarkers.current = () => {};
        fit.current = () => {};
      };
    }, [props.asset.id]);

    useEffect(() => {
      refreshMarkers.current();
      const instance = map.current;
      if (!instance) return;
      if (!props.moving) {
        movingMarker.current?.remove();
        movingMarker.current = null;
        return;
      }
      if (!movingMarker.current) {
        const marker = L.marker(
          pointToLatLng(props.moving.point, props.asset),
          {
            icon: icon(props.moving.location, true, true),
            draggable: true,
            autoPan: true,
            bubblingMouseEvents: false,
            title: "Arraste para mover o local",
          },
        ).addTo(instance);
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          latest.current.onMove(
            clampPoint(
              latLngToPoint(position.lat, position.lng, latest.current.asset),
            ),
          );
        });
        movingMarker.current = marker;
      } else
        movingMarker.current.setLatLng(
          pointToLatLng(props.moving.point, props.asset),
        );
    }, [props.locations, props.selectedId, props.moving, props.asset]);

    return (
      <div className={`atlas-viewport mode-${props.mode}`}>
        <div
          ref={host}
          className="atlas-canvas"
          role="region"
          aria-label="Mapa interativo"
        />
        {error && (
          <div className="atlas-load-error" role="alert">
            Não foi possível carregar uma parte do mapa.{" "}
            <button
              className="button"
              onClick={() => {
                setError(false);
                layer.current?.redraw();
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
        <a
          className="atlas-attribution"
          href="https://leafletjs.com"
          target="_blank"
          rel="noreferrer"
        >
          Leaflet
        </a>
      </div>
    );
  },
);
