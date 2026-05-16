import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1Ijoic2VwMDMyIiwiYSI6ImNtcDdwenRrcDA0cGsyc3BpanJpdGhkbGQifQ.d_8drIPcjYYStvM4vz-cyw';

const map = new mapboxgl.Map({

  container: 'map',

  style: 'mapbox://styles/mapbox/streets-v12',

  center: [-71.09415, 42.36027],

  zoom: 12,

  minZoom: 5,

  maxZoom: 18

});

const svg = d3.select('#map').select('svg');

function getCoords(station) {

  const point = new mapboxgl.LngLat(+station.lon, +station.lat);

  const { x, y } = map.project(point);

  return { cx: x, cy: y };

}

function minutesSinceMidnight(date) {

  return date.getHours() * 60 + date.getMinutes();

}

function formatTime(minutes) {

  const d = new Date(0, 0, 0, 0, minutes);

  return d.toLocaleString('en-US', { timeStyle: 'short' });

}

function computeStationTraffic(stations, trips) {

  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);

  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

  return stations.map(station => {

    const id = station.short_name;

    const dep = departures.get(id) ?? 0;

    const arr = arrivals.get(id) ?? 0;

    return {

      ...station,

      departures: dep,

      arrivals: arr,

      totalTraffic: dep + arr

    };

  });

}

function filterTripsByTime(trips, timeFilter) {

  if (timeFilter === -1) return trips;

  return trips.filter(trip => {

    const s = minutesSinceMidnight(trip.started_at);

    const e = minutesSinceMidnight(trip.ended_at);

    return (

      Math.abs(s - timeFilter) <= 60 ||

      Math.abs(e - timeFilter) <= 60

    );

  });

}

map.on('load', async () => {

  // ===== LOAD DATA =====

  const json = await d3.json(

    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'

  );

  const stations = json.data.stations;

  const trips = await d3.csv(

    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',

    d => {

      d.started_at = new Date(d.started_at);

      d.ended_at = new Date(d.ended_at);

      return d;

    }

  );

  let currentStations = computeStationTraffic(stations, trips);

  // ===== SCALES =====

  const radiusScale = d3.scaleSqrt()

    .domain([0, d3.max(currentStations, d => d.totalTraffic)])

    .range([0, 25]);

  const stationFlow = d3.scaleQuantize()

    .domain([0, 1])

    .range([0, 0.5, 1]);

  // ===== MAP LAYERS =====

  map.addSource('boston_route', {

    type: 'geojson',

    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'

  });

  map.addLayer({

    id: 'boston-bike-lanes',

    type: 'line',

    source: 'boston_route',

    paint: {

      'line-color': '#32D400',

      'line-width': 3,

      'line-opacity': 0.5

    }

  });

  map.addSource('cambridge_route', {

    type: 'geojson',

    data: 'https://opendata.arcgis.com/datasets/cambridgegis::bike-facilities.geojson'

  });

  map.addLayer({

    id: 'cambridge-bike-lanes',

    type: 'line',

    source: 'cambridge_route',

    paint: {

      'line-color': '#00BFFF',

      'line-width': 3,

      'line-opacity': 0.5

    }

  });

  // ===== DRAW CIRCLES =====

  let circles = svg

    .selectAll('circle')

    .data(currentStations, d => d.short_name)

    .join('circle')

    .attr('stroke', 'white')

    .attr('stroke-width', 1)

    .attr('opacity', 0.7)

    .attr('r', d => radiusScale(d.totalTraffic))

    .style('--departure-ratio', d => {
  if (d.totalTraffic === 0) return 0.5;

  const ratio = d.departures / d.totalTraffic;

  if (ratio > 0.6) return 1;
  if (ratio < 0.4) return 0;
  return 0.5;
})

  circles.append('title');

  circles.select('title')

    .text(d =>

      `${d.totalTraffic} trips (${d.departures} dep, ${d.arrivals} arr)`

    );


  function updatePositions() {

    circles

      .attr('cx', d => getCoords(d).cx)

      .attr('cy', d => getCoords(d).cy);

  }

  updatePositions();

  map.on('move', updatePositions);

  map.on('zoom', updatePositions);

  map.on('resize', updatePositions);

  map.on('moveend', updatePositions);


  const slider = document.getElementById('time-slider');

  const timeLabel = document.getElementById('selected-time');

  const anyLabel = document.getElementById('any-time');

  function update(timeFilter) {

    if (timeFilter === -1) {

      timeLabel.textContent = '';

      anyLabel.style.display = 'inline';

    } else {

      timeLabel.textContent = formatTime(timeFilter);

      anyLabel.style.display = 'none';

    }

    const filteredTrips = filterTripsByTime(trips, timeFilter);

    currentStations = computeStationTraffic(stations, filteredTrips);

    radiusScale.domain([

      0,

      d3.max(currentStations, d => d.totalTraffic)

    ]);

    circles = svg

      .selectAll('circle')

      .data(currentStations, d => d.short_name)

      .join(

        enter => {

          const c = enter.append('circle')

            .attr('stroke', 'white')

            .attr('stroke-width', 1)

            .attr('opacity', 0.7);

          c.append('title');

          return c;

        },

        update => update,

        exit => exit.remove()

      )

      .attr('r', d => radiusScale(d.totalTraffic))

      .style('--departure-ratio', d =>

        d.totalTraffic === 0

          ? 0.5

          : stationFlow(d.departures / d.totalTraffic)

      );

    circles.select('title')

      .text(d =>

        `${d.totalTraffic} trips (${d.departures} dep, ${d.arrivals} arr)`

      );

    updatePositions();

  }

  slider.addEventListener('input', () => {

    update(Number(slider.value));

  });

  update(-1);

});