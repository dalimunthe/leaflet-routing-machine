Leaflet Routing Machine
=======================

Find the way from A to B on a Leaflet map, using [OSRM](http://project-osrm.org/) as backend.

Watch the [Leaflet Routing Machine demo](http://www.liedman.net/leaflet-routing-machine/).

## Features

* Wrapper to handle OSRM's API
* Show returned route on a map
* Edit start, end and waypoint points on the map

## Usage

Searching, displaying and editing a route is a complex problem with several moving parts. Leaflet Routing Machine aims to solve this problem while at offering the ability to customize how the user interacts with the routing software.

### Basics

Quickest way to get routing on your map is to use ```L.Routing.Control```:

Include script and CSS:

```HTML
<link rel="stylesheet" href="leaflet-routing-machine.css" />
<script src="leaflet-routing-machine.min.js"></script>
```

Create a map and add the routing control:

```js
var map = L.map('map');

L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

L.Routing.control({
    waypoints: [
        L.latLng(57.74, 11.94),
        L.latLng(57.6792, 11.949)
    ]
}).addTo(map);
```

### Advanced

To customize interactions, you can use the underlying classes that ```L.Routing.Control``` ties together:

* ```L.Routing.OSRM```
* ```L.Routing.Line```
* ```L.Routing.Itinerary```

### L.Routing.OSRM

Handles communication with the OSRM backend, building the request and parsing the response.

### L.Routing.Line

Displays a route on the map, and allows moving waypoints, as well as adding new waypoints.

### L.Routing.Itinerary

Displays itineraries as text in a control.
