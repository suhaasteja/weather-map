import { stations } from "./stations.js";
import { MAPBOX_TOKEN } from "./config.js";

mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/standard',
  center: [0, 20],
  zoom: 1.5
});

const sidebar = document.getElementById('sidebar');
let selectedMarker = null;

map.on('load', () => {
  // Convert stations to GeoJSON
  const geojson = {
    type: 'FeatureCollection',
    features: stations.map(station => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [station.longitude, station.latitude]
      },
      properties: {
        station_id: station.station_id,
        station_name: station.station_name,
        station_network: station.station_network,
        elevation: station.elevation,
        timezone: station.timezone,
        latitude: station.latitude,
        longitude: station.longitude
      }
    }))
  };

function spinGlobe() {
    const center = map.getCenter();
    center.lng -= 1; // Adjust this value for speed
    map.easeTo({ center, duration: 1000, easing: (n) => n });
}

map.on('moveend', spinGlobe);
spinGlobe();

  // Add a data source with clustering enabled
  map.addSource('stations', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  // Add cluster circles
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'stations',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#51bbd6',
        10,
        '#f1f075',
        50,
        '#f28cb1'
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        20,
        10,
        30,
        50,
        40
      ]
    }
  });

  // Add cluster count labels
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'stations',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12
    }
  });

  // Add individual points (unclustered)
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'stations',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#3FB1CE',
      'circle-radius': 8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff'
    }
  });

  // Click on cluster to zoom in
  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ['clusters']
    });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('stations').getClusterExpansionZoom(
      clusterId,
      (err, zoom) => {
        if (err) return;

        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom: zoom
        });
      }
    );
  });

  // Click on individual point
  map.on('click', 'unclustered-point', (e) => {
    console.log(e.features[0]);
    const coordinates = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;

    document.getElementById('location-title').textContent = props.station_name;
    document.getElementById('location-subtitle').textContent = props.station_id;
    document.getElementById('sidebar-content').innerHTML = `
      <div class="info-item">
        <label>Station ID</label>
        <value>${props.station_id}</value>
      </div>
      <div class="info-item">
        <label>Network</label>
        <value>${props.station_network}</value>
      </div>
      <div class="info-item">
        <label>Elevation</label>
        <value>${props.elevation} m</value>
      </div>
      <div class="info-item">
        <label>Timezone</label>
        <value>${props.timezone}</value>
      </div>
      <div class="info-item">
        <label>Coordinates</label>
        <value>${props.latitude.toFixed(4)}°, ${props.longitude.toFixed(4)}°</value>
      </div>
    `;
    
    sidebar.style.display = 'block';

    map.flyTo({
      center: coordinates,
      zoom: 8,
      duration: 1000
    });
  });

  // Change cursor on hover
  map.on('mouseenter', 'clusters', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'clusters', () => {
    map.getCanvas().style.cursor = '';
  });
  map.on('mouseenter', 'unclustered-point', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'unclustered-point', () => {
    map.getCanvas().style.cursor = '';
  });
});

map.on('click', (e) => {
  const features = map.queryRenderedFeatures(e.point, {
    layers: ['clusters', 'unclustered-point']
  });
  if (features.length === 0) {
    closeSidebar();
  }
});

function closeSidebar() {
  sidebar.style.display = 'none';
}

window.closeSidebar = closeSidebar;