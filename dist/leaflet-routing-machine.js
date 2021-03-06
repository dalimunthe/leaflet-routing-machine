(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing._jsonpCallbackId = 0;
	L.Routing._jsonp = function(url, callback, context, jsonpParam) {
		var callbackId = '_l_geocoder_' + (L.Routing._jsonpCallbackId++),
		    script;
		url += '&' + jsonpParam + '=' + callbackId;
		window[callbackId] = L.Util.bind(callback, context);
		script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = url;
		script.id = callbackId;
		document.getElementsByTagName('head')[0].appendChild(script);
	};

	L.Routing.OSRM = L.Class.extend({
		includes: L.Mixin.Events,
		options: {
			serviceUrl: 'http://router.project-osrm.org/viaroute',
			geometryPrecision: 6
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);
			this._hints = {
				locations: {}
			};
		},

		route: function(waypoints) {
			var url = this._buildRouteUrl(waypoints);

			L.Routing._jsonp(url, function(data) {
				this._routeDone(data, waypoints);
			}, this, 'jsonp');
		},

		_routeDone: function(response, waypoints) {
			if (response.status !== 0) {
				this.fire('error', {
					status: response.status,
					message: response.message
				});
				return;
			}

			var alts = [{
					name: response.route_name,
					geometry: this._decode(response.route_geometry, this.options.geometryPrecision),
					instructions: response.route_instructions,
					summary: response.route_summary,
					waypoints: response.via_points
				}],
			    i;

			for (i = 0; i < response.alternative_geometries.length; i++) {
				alts.push({
					name: response.alternative_names[i],
					geometry: this._decode(response.alternative_geometries[i], this.options.geometryPrecision),
					instructions: response.alternative_instructions[i],
					summary: response.alternative_summaries[i],
					waypoints: response.via_points
				})
			}

			this._saveHintData(response, waypoints);
			this.fire('routefound', {routes: alts});
		},

		_buildRouteUrl: function(waypoints) {
			var locs = [],
			    locationKey,
			    hint;

			for (var i = 0; i < waypoints.length; i++) {
				locationKey = this._locationKey(waypoints[i]);
				locs.push('loc=' + locationKey);

				hint = this._hints.locations[locationKey];
				if (hint) {
					locs.push('hint=' + hint);
				}
			}

			return this.options.serviceUrl + '?' +
				'instructions=true&' +
				locs.join('&') +
				(this._hints.checksum !== undefined ? '&checksum=' + this._hints.checksum : '');
		},

		_locationKey: function(location) {
			return location.lat + ',' + location.lng;
		},

		_saveHintData: function(route, waypoints) {
			var hintData = route.hint_data,
			    loc;
			this._hints = {
				checksum: hintData.checksum,
				locations: {}
			};
			for (var i = hintData.locations.length - 1; i >= 0; i--) {
				loc = waypoints[i];
				this._hints.locations[this._locationKey(loc)] = hintData.locations[i];
			}
		},

		// Adapted from
		// https://github.com/DennisSchiefer/Project-OSRM-Web/blob/develop/WebContent/routing/OSRM.RoutingGeometry.js
		_decode: function(encoded, precision) {
			var len = encoded.length,
			    index=0,
			    lat=0,
			    lng = 0,
			    array = [];

			precision = Math.pow(10, -precision);

			while (index < len) {
				var b,
				    shift = 0,
				    result = 0;
				do {
					b = encoded.charCodeAt(index++) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
				lat += dlat;
				shift = 0;
				result = 0;
				do {
					b = encoded.charCodeAt(index++) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
				lng += dlng;
				//array.push( {lat: lat * precision, lng: lng * precision} );
				array.push( [lat * precision, lng * precision] );
			}
			return array;
		}
	});

	L.Routing.osrm = function(options) {
		return new L.Routing.OSRM(options);
	};
})();
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing.Line = L.Class.extend({
		includes: L.Mixin.Events,

		options: {
			styles: [
				{color: 'black', opacity: 0.15, weight: 7},
				{color: 'white', opacity: 0.8, weight: 4},
				{color: 'orange', opacity: 1, weight: 2}
			],
			dragStyle: 	{color: 'orange', opacity: 1, weight: 3},
			draggableWaypoints: true,
			addWaypoints: true
		},

		initialize: function(route, options) {
			L.Util.setOptions(this, options);
			this._route = route;

			this._wpIndices = this._findWaypointIndices();
		},

		addTo: function(map) {
			map.addLayer(this);
		},

		onAdd: function(map) {
			var geom = this._route.geometry,
			    i,
			    pl,
			    m;

			this._map = map;
			this._layers = [];
			for (i = 0; i < this.options.styles.length; i++) {
				pl = L.polyline(geom, this.options.styles[i])
					.addTo(map);
				if (this.options.addWaypoints) {
					pl.on('mousedown', this._onLineTouched, this);
				}
				this._layers.push(pl);
			}

			for (i = 0; i < this._route.waypoints.length; i++) {
				m = L.marker(this._route.waypoints[i], { draggable: true }).addTo(map);
				if (this.options.draggableWaypoints) {
					this._hookWaypointEvents(m, i);
				}
				this._layers.push(m);
			}
		},

		onRemove: function(map) {
			var i;
			for (i = 0; i < this._layers.length; i++) {
				map.removeLayer(this._layers[i]);
			}

			delete this._map;
		},

		getBounds: function() {
			return L.latLngBounds(this._route.geometry);
		},

		_createWaypointEvent: function(i, e) {
			return {index: i, latlng: e.target.getLatLng()};
		},

		_findWaypointIndices: function() {
			var wps = this._route.waypoints,
			    indices = [],
			    i;
			for (i = 0; i < wps.length; i++) {
				indices.push(this._findClosestRoutePoint(L.latLng(wps[i])));
			}

			return indices;
		},

		_findClosestRoutePoint: function(latlng) {
			var minDist = Number.MAX_VALUE,
				minIndex,
			    i,
			    d;

			for (i = this._route.geometry.length - 1; i >= 0 ; i--) {
				// TODO: maybe do this in pixel space instead?
				d = latlng.distanceTo(this._route.geometry[i]);
				if (d < minDist) {
					minIndex = i;
					minDist = d;
				}
			}

			return minIndex;
		},

		_findNearestWpBefore: function(i) {
			var j = this._wpIndices.length - 1;
			while (j >= 0 && this._wpIndices[j] > i) {
				j--;
			}

			return j;
		},

		_hookWaypointEvents: function(m, i) {
			m.on('dragstart', function(e) {
				this.fire('waypointdragstart', this._createWaypointEvent(i, e));
			}, this);
			m.on('drag', function(e) {
				this.fire('waypointdrag', this._createWaypointEvent(i, e));
			}, this);
			m.on('dragend', function(e) {
				this.fire('waypointdragend', this._createWaypointEvent(i, e));
			}, this);
		},

		_onLineTouched: function(e) {
			var afterIndex = this._findNearestWpBefore(this._findClosestRoutePoint(e.latlng));

			this._newWp = {
				afterIndex: afterIndex,
				marker: L.marker(e.latlng).addTo(this._map),
				line: L.polyline([
					this._route.waypoints[afterIndex],
					e.latlng,
					this._route.waypoints[afterIndex + 1]
				], this.options.dragStyle).addTo(this._map)
			};
			this._layers.push(this._newWp.marker);
			this._layers.push(this._newWp.line);
			this._map.on('mousemove', this._onDragNewWp, this);
			this._map.on('mouseup', this._onWpRelease, this);
		},

		_onDragNewWp: function(e) {
			this._newWp.marker.setLatLng(e.latlng);
			this._newWp.line.spliceLatLngs(1, 1, e.latlng);
		},

		_onWpRelease: function(e) {
			this._map.off('mouseup', this._onWpRelease, this);
			this._map.off('mousemove', this._onDragNewWp, this);
			this.fire('waypointadded', {
				afterIndex: this._newWp.afterIndex,
				latlng: e.latlng
			});
		}
	});

	L.Routing.line = function(route, options) {
		return new L.Routing.Line(route, options);
	};
})();
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing.Itinerary = L.Control.extend({
		includes: L.Mixin.Events,
		initialize: function(router) {
			this._router = router;
		},

		onAdd: function() {
			this._container = L.DomUtil.create('div', 'leaflet-routing-container leaflet-bar');
			this._router.on('routefound', this._routeFound, this);

			return this._container;
		},

		onRemove: function() {
			this._router.off('routefound', this._routeFound, this);
		},

		_routeFound: function(e) {
			var i,
			    alt,
			    altDiv;

			this._routes = e.routes;

			this._container.innerHTML = '';
			for (i = 0; i < e.routes.length; i++) {
				alt = e.routes[i];
				altDiv = L.DomUtil.create('div', 'leaflet-routing-alt' +
					(i > 0 ? ' leaflet-routing-alt-minimized' : ''),
					this._container);
				altDiv.innerHTML = '<h2>' + alt.name.join(', ') + '</h2>' +
					'<h3>' + this._formatDistance(alt.summary.total_distance) +
					', ' + this._formatTime(alt.summary.total_time) + '</h3>';
				L.DomEvent.addListener(altDiv, 'click', this._onAltClicked, this);

				altDiv.appendChild(this._createItineraryTable(alt));
			}

			this.fire('routeselected', {route: this._routes[0]});
		},

		_createItineraryTable: function(r) {
			var table = L.DomUtil.create('table', ''),
			    body = L.DomUtil.create('tbody', '', table),
			    i,
			    instr,
			    row;

			for (i = 0; i < r.instructions.length; i++) {
				instr = r.instructions[i];
				row = L.DomUtil.create('tr', '', body);
				row.innerHTML =
					'<td>' + this._instruction(instr, i) + '</td>' +
					'<td>' + this._formatDistance(instr[2]) + '</td>';
			}

			return table;
		},

		_onAltClicked: function(e) {
			var altElem,
			    j,
			    n,
			    isCurrentSelection;

			altElem = e.target;
			while (!L.DomUtil.hasClass(altElem, 'leaflet-routing-alt')) {
				altElem = altElem.parentElement;
			}

			for (j = 0; j < this._container.children.length; j++) {
				n = this._container.children[j];
				isCurrentSelection = altElem === n;
				L.DomUtil[isCurrentSelection ? 'removeClass' : 'addClass'](n, 'leaflet-routing-alt-minimized');

				if (isCurrentSelection) {
					this.fire('routeselected', {route: this._routes[j]});
				}
			}

			L.DomEvent.stop(e);
		},

		_formatDistance: function(d /* Number (meters) */) {
			var pow10 = Math.pow(10, (Math.floor(d) + '').length - 1),
				r = Math.floor(d / pow10 * 2),
				p = r % 2 ? pow10 / 2 : pow10,
				v = Math.round(d / p) * p;

			return v >= 1000 ? ((v / 1000) + ' km') : (v + ' m');
		},

		_formatTime: function(t /* Number (seconds) */) {
			if (t > 86400) {
				return Math.round(t / 3600) + ' h';
			} else if (t > 3600) {
				return Math.floor(t / 3600) + ' h ' +
					Math.round((t % 3600) / 60) + ' min';
			} else if (t > 300) {
				return Math.round(t / 60) + ' min';
			} else if (t > 60) {
				return Math.floor(t / 60) + ' min ' +
					(t % 60) + ' s';
			} else {
				return t + ' s';
			}
		},

		_instruction: function(instr, i) {
			var template,
			    driveDir = instr[0].split('-');

			switch (parseInt(driveDir, 10)) {
			case 0:
				template = '';
				break;
			case 1:
				template = (i === 0 ? 'Head' : 'Continue') + ' {dir}' + (instr[1] ? ' on {1}' : '');
				break;
			case 2:
				template = 'Slight right' + (instr[1] ? ' onto {1}' : '');
				break;
			case 3:
				template = 'Right' + (instr[1] ? ' onto {1}' : '');
				break;
			case 4:
				template = 'Sharp right' + (instr[1] ? ' onto {1}' : '');
				break;
			case 5:
				template = 'Turn around';
				break;
			case 6:
				template = 'Sharp left' + (instr[1] ? ' onto {1}' : '');
				break;
			case 7:
				template = 'Left' + (instr[1] ? ' onto {1}' : '');
				break;
			case 8:
				template = 'Slight left' + (instr[1] ? ' onto {1}' : '');
				break;
			case 9:
				template = 'Waypoint reached';
				break;
			case 10:
				template =  'Head {dir}';
				break;
			case 11:
				template =  'Take the {exit} exit in the roundabout';
				break;
			case 12:
				template =  'Leave the roundabout by the {exit} exit';
				break;
			case 13:
				template =  'Stay on roundabout';
				break;
			case 14:
				template =  'Start at end of {1}';
				break;
			case 15:
				template =  'Destination reached';
				break;
			case 16:
				template =  'Enter against allowed direction';
				break;
			case 17:
				template =  'Leave against allowed direction';
				break;
			}

			return L.Util.template(template, L.extend({exit: this._formatOrder(driveDir[1]), dir: this._dir[instr[6]]}, instr));
		},

		_formatOrder: function(n) {
			var i = n % 10 - 1,
				suffix = ['st', 'nd', 'rd'];

			return suffix[i] ? n + suffix[i] : n + 'th';
		},

		_dir: {
			N: 'north',
			NE: 'northeast',
			E: 'east',
			SE: 'southeast',
			S: 'south',
			SW: 'southwest',
			W: 'west',
			NW: 'northwest'
		}
	});

	L.Routing.Itinerary._instructions = {
	};

	L.Routing.itinerary = function(router) {
		return new L.Routing.Itinerary(router);
	};
})();
(function() {
	'use strict';

	L.Routing.Control = L.Routing.Itinerary.extend({
		options: {
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);

			this._router = this.options.router || new L.Routing.OSRM();
			this._waypoints = this.options.waypoints || [];

			L.Routing.Itinerary.prototype.initialize.call(this, this._router);

			this.on('routeselected', this._routeSelected, this);

			if (this._waypoints) {
				this._router.route(this._waypoints);
			}
		},

		onAdd: function(map) {
			this._map = map;
			return L.Routing.Itinerary.prototype.onAdd.call(this, map);
		},

		onRemove: function(map) {
			if (this._line) {
				map.removeLayer(this._line);
			}
			return L.Routing.Itinerary.prototype.onRemove.call(this, map);
		},

		setVias: function(waypoints) {
			this._waypoints = waypoints;
			this._router.route(waypoints);
		},

		spliceVias: function() {
			var removed = [].splice.apply(this._waypoints, arguments);
			this._router.route(this._waypoints);
			return removed;
		},

		_routeSelected: function(e) {
			var route = e.route;

			if (this._line) {
				this._map.removeLayer(this._line);
			}

			this._line = L.Routing.line(route);
			this._line.addTo(this._map);
			this._map.fitBounds(this._line.getBounds());

			this._hookEvents(this._line);
		},

		_hookEvents: function(l) {
			var wps = this._waypoints,
			    _this = this,
				t;

			l.on('waypointdrag', function(e) {
				wps[e.index] = e.latlng;
				if (t) {
					clearTimeout(t);
				}
				t = setTimeout(function() {
					_this._router.route(wps);
				}, 1000);
			});

			l.on('waypointadded', function(e) {
				this.spliceVias(e.afterIndex + 1, 0, e.latlng);
			}, this);
		}
	});

	L.Routing.control = function(options) {
		return new L.Routing.Control(options);
	};
})();
