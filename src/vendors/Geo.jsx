import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

class RotateNorthControl {
  constructor() {
    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.innerText = 'N';
    this._btn.onclick = () => {
      if (this._map) {
        this._map.easeTo({ bearing: 0 });
      }
    };

    this._container = document.createElement('div');
    this._container.className = 'maplibre-ctrl maplibre-ctrl-group';
    this._container.appendChild(this._btn);
  }

  onAdd(map) {
    this._map = map;
    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}

function Geo(props) {
  const [mapContainer, setMapContainer] = useState(null);

  useEffect(() => {
    if (mapContainer && !props.skipRedraw()) {
      const map = new maplibregl.Map({
        container: mapContainer,
        style: props.mapStyleUrl, // Use the styleUrl prop here
        center: props.center,
        zoom: props.zoom,
        pitch: props.pitch,
      });

      map.on('load', () => {
        // Add the GeoJSON layer here
        map.addSource('geojson-layer', {
          type: 'geojson',
          data: props.geoJson,
        });

        map.addLayer({
          id: 'geojson-layer',
          type: 'fill', // Default type, adjust based on your GeoJSON geometry
          source: 'geojson-layer',
          layout: {},
          paint: {
            'fill-color': '#888888', // Example fill color
            'fill-opacity': 0.5,
          },
        });
      });

      const rotateNorthControl = new RotateNorthControl();
      map.addControl(rotateNorthControl, 'top-right');

      // Cleanup function to remove map on unmount
      return () => map.remove();
    }
  }, [mapContainer, props]);

  return <div ref={setMapContainer} style={{ height: '100%', width: '100%' }}></div>;
}

Geo.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number.isRequired,
  center: PropTypes.array.isRequired,
  zoom: PropTypes.number.isRequired,
  pitch: PropTypes.number,
  geoJson: PropTypes.object.isRequired,
  mapStyleUrl: PropTypes.string.isRequired, // Ensure this prop is passed
  showLogo: PropTypes.bool,
  onDataChange: PropTypes.func,
  skipRedraw: PropTypes.func.isRequired,
};

export default Geo;
