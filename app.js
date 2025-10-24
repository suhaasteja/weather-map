import { MAPBOX_TOKEN } from "./config.js";

mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/standard",
  center: [0, 20],
  zoom: 1.5,
  collectResourceTiming: false,
});

const detailSidebar = document.getElementById("sidebar");
const infoSidebar = document.getElementById("info-sidebar");
let selectedMarker = null;
let stations = [];
let currentChart = null;

// Fetch stations from API
async function fetchStations() {
  try {
    const response = await fetch("https://sfc.windbornesystems.com/stations", {
      mode: "cors",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    stations = await response.json();
    console.log("Fetched stations:", stations.length);
    initializeMap();
  } catch (error) {
    console.error("Error fetching stations:", error);
    alert("Failed to load weather stations. Please try again later.");
  }
}

// Fetch station history from API
async function fetchStationHistory(stationId) {
  try {
    const response = await fetch(
      `https://sfc.windbornesystems.com/historical_weather?station=${stationId}`,
      {
        mode: "cors",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Fetched history for station:", stationId, data);
    return data;
  } catch (error) {
    console.error("Error fetching station history:", error);
    return null;
  }
}

// Add to your existing code
function createWindRose(historyData) {
  const { series, stats } = processWindData(historyData.points);

  if (series.length === 0) {
    return {
      html: '<div class="no-data">No wind data available</div>',
      options: null,
    };
  }

  const options = {
    chart: {
      polar: true,
      type: "column",
      height: 450,
    },
    title: {
      text: "",
    },
    pane: { size: "85%" },
    legend: {
      align: "right",
      verticalAlign: "middle",
      layout: "vertical",
    },
    xAxis: {
      categories: [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ],
      tickmarkPlacement: "on",
    },
    yAxis: {
      min: 0,
      endOnTick: false,
      showLastLabel: true,
      title: { text: "Frequency (%)" },
      labels: { format: "{value}%" },
      reversedStacks: false,
    },
    tooltip: {
      valueSuffix: "%",
      format: "<b>{series.name}</b><br/>{point.category}: {point.y}%",
    },
    plotOptions: {
      series: {
        stacking: "normal",
        shadow: false,
        groupPadding: 0,
        pointPlacement: "on",
      },
    },
    series: series,
  };

  return {
    html: `
      <div id="wind-rose-chart"></div>
      <div class="wind-stats">
        <p><strong>Avg Speed:</strong> ${stats.avgSpeed.toFixed(1)} mph</p>
        <p><strong>Max Speed:</strong> ${stats.maxSpeed.toFixed(1)} mph</p>
        <p><strong>Prevailing Direction:</strong> ${stats.prevailingDir}</p>
      </div>
    `,
    options: options,
  };
}

function processWindData(points) {
  const sectors = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const speedBins = [
    { min: 0, max: 5, label: "0-5 mph" },
    { min: 5, max: 10, label: "5-10 mph" },
    { min: 10, max: 15, label: "10-15 mph" },
    { min: 15, max: 25, label: "15-25 mph" },
    { min: 25, max: 100, label: ">25 mph" },
  ];

  const distribution = Array(16)
    .fill(0)
    .map(() => Array(speedBins.length).fill(0));
  let totalSpeed = 0;
  let maxSpeed = 0;
  let validPoints = 0;

  points.forEach((point) => {
    if (point.wind_x === null || point.wind_y === null) return;

    const speed = Math.sqrt(point.wind_x ** 2 + point.wind_y ** 2);
    let direction = (Math.atan2(point.wind_x, point.wind_y) * 180) / Math.PI;
    if (direction < 0) direction += 360;

    const sectorIdx = Math.floor((direction + 11.25) / 22.5) % 16;
    const speedIdx = speedBins.findIndex(
      (bin) => speed >= bin.min && speed < bin.max
    );

    if (speedIdx >= 0) {
      distribution[sectorIdx][speedIdx]++;
      totalSpeed += speed;
      maxSpeed = Math.max(maxSpeed, speed);
      validPoints++;
    }
  });

  if (validPoints === 0) return { series: [], stats: {} };

  // Find prevailing direction
  const sectorTotals = distribution.map((sector) =>
    sector.reduce((a, b) => a + b, 0)
  );
  const maxSectorIdx = sectorTotals.indexOf(Math.max(...sectorTotals));

  // Convert to percentages and create series
  const series = speedBins.map((bin, binIdx) => ({
    name: bin.label,
    data: distribution.map((sector) =>
      parseFloat(((sector[binIdx] / validPoints) * 100).toFixed(2))
    ),
  }));

  return {
    series,
    stats: {
      avgSpeed: totalSpeed / validPoints,
      maxSpeed: maxSpeed,
      prevailingDir: sectors[maxSectorIdx],
    },
  };
}

// Process data for heatmap
function processTemperatureData(points) {
  // Clean data - filter out null temperatures
  const cleanedPoints = points.filter(
    (point) => point.temperature !== null && point.timestamp
  );

  if (cleanedPoints.length === 0) {
    return { series: [], dates: [] };
  }

  // Group by date and hour
  const dataByDate = {};

  cleanedPoints.forEach((point) => {
    const date = new Date(point.timestamp);
    const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
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
  const series = hours.map((hour) => {
    return {
      name: `${hour.toString().padStart(2, "0")}:00`,
      data: dates.map((date) => {
        const temps = dataByDate[date][hour];
        if (temps && temps.length > 0) {
          const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
          return {
            x: date,
            y: Math.round(avgTemp * 10) / 10, // Round to 1 decimal
          };
        }
        return {
          x: date,
          y: null,
        };
      }),
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

  series.forEach((s) => {
    s.data.forEach((d) => {
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
      name: `${Math.round(minTemp)}°F - ${Math.round(
        minTemp + tempRange * 0.25
      )}°F`,
      color: "#0066CC",
    },
    {
      from: minTemp + tempRange * 0.25,
      to: minTemp + tempRange * 0.5,
      name: `${Math.round(minTemp + tempRange * 0.25)}°F - ${Math.round(
        minTemp + tempRange * 0.5
      )}°F`,
      color: "#00A8E8",
    },
    {
      from: minTemp + tempRange * 0.5,
      to: minTemp + tempRange * 0.75,
      name: `${Math.round(minTemp + tempRange * 0.5)}°F - ${Math.round(
        minTemp + tempRange * 0.75
      )}°F`,
      color: "#FFB200",
    },
    {
      from: minTemp + tempRange * 0.75,
      to: maxTemp,
      name: `${Math.round(minTemp + tempRange * 0.75)}°F - ${Math.round(
        maxTemp
      )}°F`,
      color: "#FF5733",
    },
  ];

  const options = {
    series: series,
    chart: {
      height: 450,
      type: "heatmap",
      toolbar: {
        show: true,
        tools: {
          download: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 2,
        useFillColorAsStroke: false,
        colorScale: {
          ranges: colorRanges,
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      width: 1,
      colors: ["#fff"],
    },
    title: {
      text: "Temperature Heatmap (°F)",
      style: {
        fontSize: "16px",
        fontWeight: "bold",
        color: "#333",
      },
    },
    xaxis: {
      type: "category",
      labels: {
        rotate: -45,
        rotateAlways: true,
        style: {
          fontSize: "10px",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          fontSize: "10px",
        },
      },
    },
    tooltip: {
      custom: function ({ series, seriesIndex, dataPointIndex, w }) {
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
      },
    },
    legend: {
      show: true,
      position: "bottom",
      horizontalAlign: "center",
      markers: {
        width: 20,
        height: 20,
        radius: 2,
      },
    },
  };

  // Return both HTML and options to render later
  return {
    html: '<div id="temperature-chart"></div>',
    options: options,
  };
}

function initializeMap() {
  // Convert stations to GeoJSON
  const geojson = {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [station.longitude, station.latitude],
      },
      properties: {
        station_id: station.station_id,
        station_name: station.station_name,
        station_network: station.station_network,
        elevation: station.elevation,
        timezone: station.timezone,
        latitude: station.latitude,
        longitude: station.longitude,
      },
    })),
  };

  // Add a data source with clustering enabled
  map.addSource("stations", {
    type: "geojson",
    data: geojson,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  });

  // Add cluster circles
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#51bbd6",
        10,
        "#f1f075",
        50,
        "#f28cb1",
      ],
      "circle-radius": ["step", ["get", "point_count"], 20, 10, 30, 50, 40],
    },
  });

  // Add cluster count labels
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12,
    },
  });

  // Add individual points (unclustered)
  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "stations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#3FB1CE",
      "circle-radius": 8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });

  // Click on cluster to zoom in
  map.on("click", "clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ["clusters"],
    });
    const clusterId = features[0].properties.cluster_id;
    map
      .getSource("stations")
      .getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;

        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom: zoom,
        });
      });
  });

  map.on("click", "unclustered-point", async (e) => {
    const coordinates = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;

    document.getElementById("location-title").textContent = props.station_name;
    document.getElementById("location-subtitle").textContent = props.station_id;

    // Show loading state
    document.getElementById("sidebar-content").innerHTML = `
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
      <value>${props.latitude.toFixed(4)}°, ${props.longitude.toFixed(
      4
    )}°</value>
    </div>
    <div class="loading">Loading temperature and wind data...</div>
  `;

    detailSidebar.style.display = "block";

    // Fetch and display station history
    const historyData = await fetchStationHistory(props.station_id);

    if (historyData && historyData.points) {
      const chartData = createTemperatureHeatmap(historyData);
      const windData = createWindRose(historyData); // ADD THIS LINE

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
        <value>${props.latitude.toFixed(4)}°, ${props.longitude.toFixed(
        4
      )}°</value>
      </div>
      <div class="history-section">
        <h3>Temperature Analysis</h3>
        <p><strong>Data Points:</strong> ${historyData.points_count}</p>
        <p><strong>Period:</strong> ${new Date(
          historyData.start_date
        ).toLocaleDateString()} - ${new Date(
        historyData.end_date
      ).toLocaleDateString()}</p>
        ${chartData.html}
      </div>
      <div class="history-section">
        <h3>Wind Rose Distribution</h3>
        ${windData.html}
      </div>
    `;
      document.getElementById("sidebar-content").innerHTML = contentHTML;

      // Then render the chart after DOM is updated
      setTimeout(() => {
        // Destroy previous chart if exists
        if (currentChart) {
          currentChart.destroy();
        }

        // Render temperature chart
        const chartElement = document.querySelector("#temperature-chart");
        if (chartElement) {
          currentChart = new ApexCharts(chartElement, chartData.options);
          currentChart.render();
        }

        // ADD THIS: Render wind rose chart
        if (windData.options && document.querySelector("#wind-rose-chart")) {
          new Highcharts.Chart("wind-rose-chart", windData.options);
        }
      }, 50);
    }

    map.flyTo({
      center: coordinates,
      zoom: 8,
      duration: 1000,
    });
  });

  // Change cursor on hover
  map.on("mouseenter", "clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("mouseenter", "unclustered-point", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "unclustered-point", () => {
    map.getCanvas().style.cursor = "";
  });
}

map.on("load", () => {
  fetchStations();
});

map.on("click", (e) => {
  const features = map.queryRenderedFeatures(e.point, {
    layers: ["clusters", "unclustered-point"],
  });
  if (features.length === 0) {
    closeSidebar();
  }
});

function closeSidebar() {
  detailSidebar.style.display = "none";
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }
  map.flyTo({
    zoom: 5.5,
  });
}

window.closeSidebar = closeSidebar;

// create heatmaps for each station weather or other best representation for weather - temperature done
// retry api or error handling for api format failure
// integrate station history api - done
// average stats for each station
// add number of days (refer to health life of balloon - 41 days)
// complete stats - number of stations
// add live flight data
// possible flight collisons
// have a permanent sidebar (right) to explain what this product does - done
// showcase path for markers based on its previous locations - not possible - no lat long
