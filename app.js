import { MAPBOX_TOKEN } from "./config.js";

mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/standard',
  center: [0, 20],
  zoom: 1.5,
  collectResourceTiming: false
});

const detailSidebar = document.getElementById('sidebar');
const infoSidebar = document.getElementById('info-sidebar');
let selectedMarker = null;
let stations = [];
let currentChart = null;

// Fetch stations from API
async function fetchStations() {
  try {
    const response = await fetch('https://sfc.windbornesystems.com/stations', {
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    stations = await response.json();
    console.log('Fetched stations:', stations.length);
    initializeMap();
  } catch (error) {
    console.error('Error fetching stations:', error);
    alert('Failed to load weather stations. Please try again later.');
  }
}

// Fetch station history from API
async function fetchStationHistory(stationId) {
  try {
    const response = await fetch(`https://sfc.windbornesystems.com/historical_weather?station=${stationId}`, {
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Fetched history for station:', stationId, data);
    return data;
  } catch (error) {
    console.error('Error fetching station history:', error);
    return null;
  }
}

// Process data for heatmap
function processTemperatureData(points) {
  // Clean data - filter out null temperatures
  const cleanedPoints = points.filter(point => point.temperature !== null && point.timestamp);
  
  if (cleanedPoints.length === 0) {
    return { series: [], dates: [] };
  }
  
  // Group by date and hour
  const dataByDate = {};
  
  cleanedPoints.forEach(point => {
    const date = new Date(point.timestamp);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const hour = date.getHours();
    
    if (!dataByDate[dateKey]) {
      dataByDate[dateKey] = {};
    }
    
    // Store temperature for this hour
    if (!dataByDate[dateKey][hour]) {
      dataByDate[dateKey][hour] = [];
    }
    dataByDate[dateKey][hour].push(point.temperature);
  });
  
  // Convert to ApexCharts format
  const dates = Object.keys(dataByDate).sort();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // Create series for each hour
  const series = hours.map(hour => {
    return {
      name: `${hour.toString().padStart(2, '0')}:00`,
      data: dates.map(date => {
        const temps = dataByDate[date][hour];
        if (temps && temps.length > 0) {
          const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
          return {
            x: date,
            y: Math.round(avgTemp * 10) / 10 // Round to 1 decimal
          };
        }
        return {
          x: date,
          y: null
        };
      })
    };
  });
  
  return { series, dates };
}

// Create temperature heatmap
function createTemperatureHeatmap(historyData) {
  const { series, dates } = processTemperatureData(historyData.points);
  
  if (series.length === 0) {
    return '<div class="no-data">No temperature data available</div>';
  }
  
  // Find min and max temperature for dynamic color scaling
  let minTemp = Infinity;
  let maxTemp = -Infinity;
  
  series.forEach(s => {
    s.data.forEach(d => {
      if (d.y !== null) {
        minTemp = Math.min(minTemp, d.y);
        maxTemp = Math.max(maxTemp, d.y);
      }
    });
  });
  
  // Create color ranges based on actual data with temperature ranges
  const tempRange = maxTemp - minTemp;
  const colorRanges = [
    {
      from: minTemp,
      to: minTemp + tempRange * 0.25,
      name: `${Math.round(minTemp)}°F - ${Math.round(minTemp + tempRange * 0.25)}°F`,
      color: '#0066CC'
    },
    {
      from: minTemp + tempRange * 0.25,
      to: minTemp + tempRange * 0.5,
      name: `${Math.round(minTemp + tempRange * 0.25)}°F - ${Math.round(minTemp + tempRange * 0.5)}°F`,
      color: '#00A8E8'
    },
    {
      from: minTemp + tempRange * 0.5,
      to: minTemp + tempRange * 0.75,
      name: `${Math.round(minTemp + tempRange * 0.5)}°F - ${Math.round(minTemp + tempRange * 0.75)}°F`,
      color: '#FFB200'
    },
    {
      from: minTemp + tempRange * 0.75,
      to: maxTemp,
      name: `${Math.round(minTemp + tempRange * 0.75)}°F - ${Math.round(maxTemp)}°F`,
      color: '#FF5733'
    }
  ];
  
  const options = {
    series: series,
    chart: {
      height: 450,
      type: 'heatmap',
      toolbar: {
        show: true,
        tools: {
          download: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true
        }
      }
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 2,
        useFillColorAsStroke: false,
        colorScale: {
          ranges: colorRanges
        }
      }
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      width: 1,
      colors: ['#fff']
    },
    title: {
      text: 'Temperature Heatmap (°F)',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#333'
      }
    },
    xaxis: {
      type: 'category',
      labels: {
        rotate: -45,
        rotateAlways: true,
        style: {
          fontSize: '10px'
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          fontSize: '10px'
        }
      }
    },
    tooltip: {
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        const data = w.config.series[seriesIndex].data[dataPointIndex];
        if (data.y === null) {
          return '<div class="apexcharts-tooltip-custom">No data</div>';
        }
        return `
          <div class="apexcharts-tooltip-custom">
            <strong>${data.x}</strong><br/>
            <strong>${w.config.series[seriesIndex].name}</strong><br/>
            Temperature: <strong>${data.y}°F</strong>
          </div>
        `;
      }
    },
    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'center',
      markers: {
        width: 20,
        height: 20,
        radius: 2
      }
    }
  };
  
  // Return both HTML and options to render later
  return {
    html: '<div id="temperature-chart"></div>',
    options: options
  };
}

function initializeMap() {
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
  map.on('click', 'unclustered-point', async (e) => {
    const coordinates = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;

    document.getElementById('location-title').textContent = props.station_name;
    document.getElementById('location-subtitle').textContent = props.station_id;
    
    // Show loading state
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
      <div class="loading">Loading temperature data...</div>
    `;
    
    detailSidebar.style.display = 'block';

    // Fetch and display station history
    const historyData = await fetchStationHistory(props.station_id);
    
    if (historyData && historyData.points) {
      const chartData = createTemperatureHeatmap(historyData);
      
      // First set the HTML
      const contentHTML = `
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
        <div class="history-section">
          <h3>Temperature Analysis</h3>
          <p><strong>Data Points:</strong> ${historyData.points_count}</p>
          <p><strong>Period:</strong> ${new Date(historyData.start_date).toLocaleDateString()} - ${new Date(historyData.end_date).toLocaleDateString()}</p>
          ${chartData.html}
        </div>
      `;
      document.getElementById('sidebar-content').innerHTML = contentHTML;
      
      // Then render the chart after DOM is updated
      setTimeout(() => {
        // Destroy previous chart if exists
        if (currentChart) {
          currentChart.destroy();
        }
        
        const chartElement = document.querySelector("#temperature-chart");
        if (chartElement) {
          currentChart = new ApexCharts(chartElement, chartData.options);
          currentChart.render();
        }
      }, 50);
    }

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
}

map.on('load', () => {
  fetchStations();
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
  detailSidebar.style.display = 'none';
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }
  map.flyTo({
    zoom: 5.5
  });
}

window.closeSidebar = closeSidebar;

// integrate station history api - done
// average stats for each station
// create heatmaps for each station weather or other best representation for weather
// have a permanent sidebar (right) to explain what this product does
// showcase path for markers based on its previous locations
// refer to live weather data to show possible wind/temperature in nearby areas
// add live flight data