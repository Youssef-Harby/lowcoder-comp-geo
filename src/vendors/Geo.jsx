//CSS
import 'ol/ol.css';
import 'ol-ext/dist/ol-ext.css';
import "@fortawesome/fontawesome-free/css/all.css"
import "./styles.css";

import { useState,useEffect, useCallback } from 'react';
import PropTypes from 'prop-types'
//React spinner
import {RingLoader} from 'react-spinners'

//The real GEO OpenLayers packages
import {Map, View} from 'ol/index';
import { Vector as VectorLayer} from 'ol/layer';
import { TileWMS, Vector as VectorSource} from 'ol/source';
import TileLayer from 'ol/layer/WebGLTile.js';
import {LineString,Polygon} from 'ol/geom';
import { fromLonLat, transformExtent } from 'ol/proj';
import {FullScreen, Zoom } from 'ol/control';
import {GeoJSON}  from 'ol/format';

//Openlayer Extend imports
import GeolocationBar from 'ol-ext/control/GeolocationBar'
import GeolocationButton from 'ol-ext/control/GeolocationButton'
import CanvasScaleLine from 'ol-ext/control/CanvasScaleLine'
import Notification from 'ol-ext/control/Notification'
import Bar from 'ol-ext/control/Bar'
import Button from 'ol-ext/control/Button'
import Toggle from 'ol-ext/control/Toggle'
import Select from 'ol-ext/control/Select'
import Overlay from 'ol-ext/control/Overlay'
import Timeline from 'ol-ext/control/Timeline'
import Swipe from 'ol-ext/control/Swipe'
import {Draw} from 'ol/interaction'
import UndoRedo from 'ol-ext/interaction/UndoRedo'

///Local import
import RotateNorthControl from './RotateNorthControl'
import {createLayer} from './helpers/Layers'
import {lightStroke,darkStroke,geoJsonStyle} from './helpers/Styles'


function Geo(props) {
  const [geoRef, setGeoRef] = useState();
  const [geoLoc,setGeoLoc] = useState();
  const [map, setMap] = useState();
  const [geoId] = useState(Math.random().toString(16).slice(2));
  //Global notification item
  const [notification] = useState(new Notification({}))
  // Vector layer for drawing
  const [drawVector] = useState(new VectorLayer({
      name: 'draw',
      source: new VectorSource(),
      style: geoJsonStyle
  }))
  // Vector layer for the tracker
  const [trackerVector] = useState(new VectorLayer({
    name: 'tracker',
    source: new VectorSource(),
  }))

  //Function to check if updating of a variable is allowed
  const allowUpdate = function(name){
    return !(props.ignoreUpdate && props.ignoreUpdate(name))
  }

  const fireEvent = function(name ,eventObject ){
    if (props.onEvent) {
      props.onEvent(name,eventObject || {},notification)
    }
  }

  //All buttons are shown by default
  const showButton = function (name ) {
    return ((props.buttons && props.buttons[name]===false) ||
      (props.defaults && props.defaults.buttons && props.defaults.buttons[name]===false)) ? false : true
  }
  
  //Fetch the geolocation based on browser or ip when center is not set
  const elementRef = useCallback(ref => {
    if ((props.center && props.center.length==2) || (props.defaults && props.defaults.center)) {
      setGeoRef(ref);
    } else {
    navigator.geolocation.getCurrentPosition(
      (success)=>{
        setGeoLoc([success.coords.longitude,success.coords.latitude]) 
        setGeoRef(ref);
      },
      (error)=>{
        fetch('https://ipapi.co/json/')
        .then(function(response) {
          if (!response.ok) {
            setGeoRef(ref);
          } else {
           response.json().then(function(data) {
            setGeoLoc([data.longitude,data.latitude])  
            setGeoRef(ref);
          })
          }
        })
      },
      {maximumAge:60000,timeout:5000,enableHighAccuracy:false});
    }
  }, []);

  //Configuration of Map component, changing watch props will rebuild map object
  useEffect(() => {
    if (geoRef) {
      geoRef.innerHTML = "<div id='GEO_"+ geoId+ "' style='height:"+props.height+"px;position:relative'></div>"

      //The real map object
      var olMap = new Map({
        controls: [],
         view: new View({
           center:  fromLonLat((props.center.length==2 ? props.center : props.defaults.center) || geoLoc || []),
           zoom: props.zoom || props.defaults.zoom ,
           maxZoom: props.maxZoom || props.defaults.maxZoom || 100, 
           rotation: props.rotation || props.defaults.rotation
         }),
         target: 'GEO_'+ geoId,
         layers: []
       });

      // Click event listener for vector features and WMS GetFeatureInfo
      olMap.on('singleclick', function (evt) {
        let hasFeature = false;
        fireEvent('click:single',evt)

        olMap.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
          // Vector feature click logic
          hasFeature = true; // Indicate that a vector feature was clicked
          fireEvent('click:feature',{properties: feature.getProperties(),layer})
          return true; // Stop iterating through features
        });

        // WMS GetFeatureInfo logic
        if (!hasFeature) { // Only proceed if no vector feature was clicked
          olMap.getLayers().forEach(layer => {
            if (layer instanceof TileLayer && layer.getSource() instanceof TileWMS) {
              const view = olMap.getView();
              const viewResolution = view.getResolution();
              const url = layer.getSource().getFeatureInfoUrl(
                evt.coordinate,
                viewResolution,
                'EPSG:3857',
                { 'INFO_FORMAT': 'text/html' }, // or application/json ?
              );
              if (url) {
                fetch(url)
                  .then(response => response.text())
                  .then(html => {
                    // Display the HTML response in an element, or process JSON as needed
                    fireEvent('click:reponse',{reponse: html})
                    // Example: document.getElementById('info').innerHTML = html;
                  });
              }
            }
          });
        }
      });

      // Optional: pointer move logic for changing cursor over WMS layers
      olMap.on('pointermove', function (evt) {
        if (evt.dragging) return;
        const pixel = olMap.getEventPixel(evt.originalEvent);
        const hit = olMap.hasFeatureAtPixel(pixel);
        olMap.getTargetElement().style.cursor = hit ? 'pointer' : '';
      });

      // Notification Control
      olMap.addControl(notification);

      //Handle the loaded event
      olMap.on('loadend', function (event) {
        fireEvent('loaded',event)
      });

      //Handle zoom event
      olMap.getView().on('change:resolution', (event) => {
        fireEvent('zoom',Object.assign({},event,{newValue: olMap.getView().getResolution()}))
      });

      //Add the buttons contols
      var zoom =  new Zoom({
        className:'ol-zoom',
        zoomInLabel: '+',
        zoomOutLabel: '-'
      })
      if (!showButton('menu')) zoom.element.classList.add('nomenu')
      if (showButton('zoom')) olMap.addControl(zoom)

      //Main menubar
      var mainbar = new Bar({className:"mainbar"});
      mainbar.setPosition("top-left")
      if (!showButton('menu')) mainbar.element.classList.add('nomenu')
      if (showButton('point')|| showButton('line') || showButton('polygon') ||
      showButton('undo') || showButton('redo') || showButton('save'))  
        olMap.addControl(mainbar);

      // Edit control bar 
      var editbar = new Bar({
        toggleOne: true,	// one control active at the same time
        group:false			// group controls together
      });
      mainbar.addControl(editbar);

      // Add editing tools
      var pedit = new Toggle({
        html: '<i class="fa fa-map-marker" ></i>',
        title: 'Point',
        interaction: new Draw({
          type: 'Point',
          source: drawVector.getSource()
        })
      });
      if (showButton('point')) editbar.addControl ( pedit );

      var ledit = new Toggle({
        html: '<i class="fa fa-share-alt" ></i>',
        title: 'Line',
        interaction: new Draw({
          type: 'LineString',
          source: drawVector.getSource(),
          // Count inserted points
          geometryFunction: function(coordinates, geometry) {
            if (geometry) geometry.setCoordinates(coordinates);
            else geometry = new LineString(coordinates);
            this.nbpts = geometry.getCoordinates().length;
            return geometry;
          }
        })
      });
      if (showButton('line')) editbar.addControl ( ledit );

      var fedit = new Toggle({
        html: '<i class="fa fa-bookmark fa-rotate-270" ></i>',
        title: 'Polygon',
        interaction: new Draw({
          type: 'Polygon',
          style: [lightStroke, darkStroke],
          source: drawVector.getSource(),
          // Count inserted points
          geometryFunction: function(coordinates, geometry) {
            //this.nbpts = coordinates[0].length;
            if (geometry) geometry.setCoordinates([coordinates[0].concat([coordinates[0][0]])]);
            else geometry = new Polygon(coordinates);
            return geometry;
          }
        })
      });
      if (showButton('polygon')) editbar.addControl ( fedit );

      // Undo redo interaction
      var undoInteraction = new UndoRedo();
      undoInteraction.on('stack:add',function(e){
        _setSkipRedraw(true)
        fireEvent("draw:add", new GeoJSON().writeFeaturesObject(drawVector.getSource().getFeatures()))
      })
      undoInteraction.on('stack:remove',function(e){
        _setSkipRedraw(true)
        fireEvent("draw:remove", new GeoJSON().writeFeaturesObject(drawVector.getSource().getFeatures()))
      })
      olMap.addInteraction(undoInteraction);

      // Add a simple push button to undo features
      var undo = new Button({
        html: '<i class="fa fa-undo"></i>',
        title: "Undo",
        handleClick: function(e) {
          undoInteraction.undo();
        }
      });
      if (showButton('undo')) mainbar.addControl (undo );
      
      // Add a simple push button to redo features
      var redo = new Button({
        html: '<i class="fa fa-redo"></i>',
        title: "Redo",
        handleClick: function(e) {
          undoInteraction.redo();
        }
      });
      if (showButton('redo')) mainbar.addControl (redo);

      // Add a simple push button to save features
      var save = new Button({
        html: '<i class="fa fa-download"></i>',
        title: "Save",
        handleClick: function(e) {
          fireEvent("tracker:save",new GeoJSON().writeFeaturesObjects(trackerVector.getSource().getFeatures()))
        }
      });
      if (showButton('save')) mainbar.addControl (save );

      //Fullscreen
      var fullscreen = new FullScreen()
      if (showButton('fullscreen')) olMap.addControl(fullscreen)

      var secondbar = new Bar();
      secondbar.setPosition("top-right")
      if (showButton('layers')|| showButton('swipeHorizontal') ||showButton('swipeVertical') 
        || showButton('timeline') ) olMap.addControl(secondbar);

      // Add a simple push button to save features
      var layersMenu = new Toggle({
        html: '<i class="fa fa-layer-group"></i>',
        title: "Layers",
        onToggle: function(e) {
          fireEvent("layers")
        }
      });
      if (showButton('layers')) secondbar.addControl (layersMenu );

      // Swipe control bar 
      var swipebar = new Bar({
        toggleOne: true,	// one control active at the same time
        group:false			// group controls together
      });
      if (showButton('swipeVertical') || showButton('swipeHorizontal'))
          secondbar.addControl(swipebar);

      var swipectrl = new Swipe({});
      swipectrl.set('position',0,5)
      //Todo Add the layers for the swipe control

      var swipeHorz = new Toggle({
        html: '<i class="fa fa-grip-lines-vertical"></i>', 
        title: "Swipe Horizontal",
        onToggle: function(event) {
          if (event.active) {
            swipectrl.set('orientation','horizontal')
            olMap.addControl(swipectrl)
          } else {
            olMap.removeControl(swipectrl)
          }
          fireEvent("swipe:horizontal",event)
        }
      });
      if (showButton('swipeHorizontal')) swipebar.addControl (swipeHorz );

      var swipeVert = new Toggle({
        html: '<i class="fa fa-grip-lines-vertical fa-rotate-90"></i>', 
        title: "Swipe Vertical",
        onToggle: function(event) {
          if (event.active) {
            swipectrl.set('orientation','vertical')
            olMap.addControl(swipectrl)
          } else {
            olMap.removeControl(swipectrl)
          }
          fireEvent("swipe:vertical",event)
        }
      });
      if (showButton('swipeVertical')) swipebar.addControl (swipeVert );


      // Menu Overlay
      var menu = new Overlay ({ 
        closeBox : true, 
        className: "slide-left menu", 
        content: `<div id="menuTitle" ><h1 id="menuTitle_`+geoId+`">${props.menuTitle.trim() || (props.defaults && props.defaults.menuTitle) || "&nbsp;"}</h1></div>
        <div id="menuContent_`+geoId+`">${props.menuContent || (props.defaults && props.defaults.menuContent)}</div>`
      });
      if (!showButton('menu')) menu.element.classList.add('nomenu')
      olMap.addControl(menu);

      // A toggle control to show/hide the menu
      var toggle = new Toggle({
        className: 'menu',
        html: '<i class="fa fa-bars" ></i>',
        title: "Menu",
        onToggle: function(event) { 
          menu.toggle(); 
          fireEvent("menu:toggle",event)
        }
      });
      if (showButton('menu')) olMap.addControl(toggle);

      var histo = [
        /* no more ?
        new ol.layer.Geoportail({ 
          name: '1970',
          title: '1965-1980',
          key: 'orthohisto',
          layer: 'ORTHOIMAGERY.ORTHOPHOTOS.1965-1980' 
        }),
        */
      ]
      //Timeline
      var tline = new Timeline({
        className: 'ol-pointer ol-zoomhover ol-timeline',
        features: histo,
        minDate: new Date('1923'),
        maxDate: new Date(),
        getFeatureDate: function(l) { return l.get('name'); },
        getHTML: function(l) { return l.get('name'); }
      });

      tline.on('scroll', function(e) {
        var layer, dmin = Infinity;
        histo.forEach(function(l, i) {
          var d = new Date(l.get('name'));
          var dt = Math.abs(e.date-d);
          if (dt < dmin) {
            layer = l;
            dmin = dt;
          }
          if (i!==0) l.setVisible(false);
        });
        if (layer){
          layer.setVisible(true);
          $('.date').text(layer.get('title') || layer.get('name'));
        }
      });
      tline.on('select', function(e) {
        tline.setDate(e.feature);
      });

      var timeline = new Toggle({
        html: '<i class="fa fa-clock"></i>', 
        title: "Timeline",
        onToggle: function(e) {
          fireEvent("timeline",e)
        }
      });
      if (showButton('timeline')) secondbar.addControl (timeline );
      //Toggle the timeline classes
      timeline.on("change:active",(event)=>{
        if (event.active) {
          scaleLineControl.element.classList.add('timeline')
          geoTracker.element.classList.add('timeline')
          geoloc.element.classList.add('timeline')
          olMap.addControl(tline);
          fireEvent('timeline:active')
        } else {
          scaleLineControl.element.classList.remove('timeline')
          geoTracker.element.classList.remove('timeline')
          geoloc.element.classList.remove('timeline')
          olMap.removeControl(tline);
          //Work arround voor scaleLineControl not moving
          olMap.removeControl(scaleLineControl);
          olMap.addControl(scaleLineControl);
          fireEvent('timeline:inactive')
        }
      });

      //GeoLocation
      var geoloc = new GeolocationButton({
        title : "GeoLocation",
        delay : 5000
      });
      if (showButton('location')) olMap.addControl(geoloc);
      geoloc.on("change:active",(event)=>{
        if (event.active) {
          notification.show("Searching GPS",3000)
          fireEvent("geoloc:search")
        }
      });
      //change:active
    
      //Add a GeoTracker
      var geoTracker = new GeolocationBar({
        source: trackerVector.getSource(),
        delay : 5000,
        followTrack: 'auto',
        minZoom: 16,
        minAccuracy:10000
      });
      if (showButton('tracker')) olMap.addControl(geoTracker)
      var rotateNorth = new RotateNorthControl();
      if (showButton('rotateNorth')) mainbar.addControl (rotateNorth );

      // CanvasScaleLine control
      var scaleLineControl = new CanvasScaleLine();
      if (showButton('scale')) olMap.addControl(scaleLineControl);

      //On move
      olMap.on('moveend', () => {
        const extent = olMap.getView().calculateExtent(olMap.getSize()); // Get the current extent
        const transformedExtent = transformExtent(extent, 'EPSG:3857', 'EPSG:4326'); // Transform the extent to WGS 84
        fireEvent('bbox:change',transformedExtent); // Call the callback with the updated bbox
      }
     );

      setMap(olMap)
      }
    }, [geoRef,props.defaults, props.buttons]);  

    //Zoom handling
    useEffect(() => {
      if (map) map.getView().setZoom(props.zoom)
    },[props.zoom]);
    //Max zoom handling
    useEffect(() => {
      if (map) {
        map.getView().setMaxZoom(props.maxZoom)
        map.getView().setZoom(Math.min(props.zoom,props.maxZoom))
      }
    },[props.maxZoom]);
    //rotation handling
    useEffect(() => {
      if (map) {
        map.getView().setRotation(props.rotation)
      }
    },[props.rotation]);
    //Center handling
    useEffect(() => {
      if (map && props.center && props.center.length==2) map.getView().setCenter(props.center)
    },[props.center]);
    //Menu title
    useEffect(() => {
      if (map) {
        var el=document.getElementById('menuTitle_'+geoId)
        if (el) el.innerHTML=(props.menuTitle.trim() || (props.defaults && props.defaults.menuTitle) || "&nbsp;")
      }
    },[props.menuTitle]);
    //Menu content
    useEffect(() => {
      if (map) {
        var el=document.getElementById('menuContent_'+geoId)
        if (el) el.innerHTML=props.menuContent || (props.defaults && props.defaults.menuContent)
      }
    },[props.menuContent]);

     // Dynamic layer updating
    useEffect(() => {
      if (map && allowUpdate('drawLayer')) {
        // Validate and create new layers
        const layers = Array.isArray(props.layers) ? props.layers : 
            props.defaults && Array.isArray(props.defaults.layers) ? props.defaults.layers : [];
        const validatedLayers = layers.filter(layer => layer !== null && layer !== undefined);
        const sortedLayers = validatedLayers
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(createLayer)
          .filter(layer => layer !== null && layer !== undefined);
        map.getLayers().clear();
        sortedLayers.forEach(layer => map.addLayer(layer));
        //ToDo connect to the switch controler, add draw and tracker layer

        //Add drawLayer and values if set
        var drawSource = new VectorSource()
        drawVector.setSource(drawSource)
        map.addLayer(drawVector)
        if (props.drawLayer) {
          try {
            var geojsonFormat = new GeoJSON();
            // reads and converts GeoJSon to Feature Object
            var features = geojsonFormat.readFeatures(props.drawLayer);
            drawSource.addFeatures(features)
          } catch(e){
            if (props.debug) console.log("drawLayer invalid json")
          }
        }

        //Trackerlayer
        map.addLayer(trackerVector)
        fireEvent("layers:update",layers)
      }
    }, [map, props.layers, props.drawLayer]); // Re-evaluate when layers change
  return (
    <div
      ref={elementRef}
      style={{ height: '100%', width: '100%' }}
    >
    <RingLoader color="#36d7b7" 
        style={{position: 'absolute',top: '45%',left: '48%',transform: 'translate(-50%, -50%)'}} />
    </div>
  );
}

Geo.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
  center: PropTypes.array,
  zoom: PropTypes.number,
  maxZoom: PropTypes.number,
  rotation: PropTypes.number,
  drawLayer: PropTypes.object,
  onEvent : PropTypes.func,
  skipRedraw: PropTypes.func,
  buttons: PropTypes.object,
  menuTitle: PropTypes.string,
  menuContent: PropTypes.string,
  ignoreUpdate: PropTypes.func,
  layers: PropTypes.array,
  defaults: PropTypes.object,
}

export default Geo;