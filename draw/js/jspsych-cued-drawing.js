/**
 * jspsych-cued-drawing
 * Judy Fan
 *
 * plugin for displaying a cue and getting drawing response
 *
 **/ 

jsPsych.plugins["jspsych-cued-drawing"] = (function() {

  var plugin = {};

  plugin.info = {
    name: "jspsych-cued-drawing",
    parameters: {
      cue_label: {
        type: jsPsych.plugins.parameterType.STRING, // BOOL, STRING, INT, FLOAT, FUNCTION, KEYCODE, SELECT, HTML_STRING, IMAGE, AUDIO, VIDEO, OBJECT, COMPLEX
        pretty_name: 'cue_label',
        default: undefined,
        description: 'The label used to cue drawing.'
      }, 
      cue_html: {
        type: jsPsych.plugins.parameterType.IMAGE,
        pretty_name: 'cue image HTML',
        default: '<img src="imageURL" height="448" width="448" id="cue_html">',
        array: true,
        description: 'The html of the image cue used to prompt drawing. Can create own style.'
      },      
      cue_image_url: {
        type: jsPsych.plugins.parameterType.STRING,
        pretty_name: 'cue_image_urls',
        default: undefined,
        array: true,
        description: 'The URL for the image cues.'
      },
      cue_duration: {
        type: jsPsych.plugins.parameterType.INT,
        pretty_name: 'cue_duration',
        default: 1000,
        description: 'How long to show the cue (in milliseconds).'
      }, 
      prompt: {
        type: jsPsych.plugins.parameterType.STRING,
        pretty_name: 'prompt',
        default: null,
        description: 'What to display to the participant as the instructions.'
      }                       
    }
  }

  plugin.trial = function(display_element, trial) {    

    // init globals
    var startTrialTime, startResponseTime, startStrokeTime, endStrokeTime, endTrialTime;

    // print errors if the parameters are not correctly formatted 
    if(typeof trial.cue_label === 'undefined'){
      console.error('Required parameter "cue_label" missing in jspsych-cued-drawing');
    }   

    // wait for a little bit for data to come back from db, then show_display
    setTimeout(function() {show_cue(); }, 1500); 

    // print trial info for debugging
    console.log('trial',trial); 

    // wrapper function to show cue, this is called when you've waited as long as you
    // reckon is long enough for the data to come back from the db
    function show_cue() {    

      var html = '';

      // create sketchpad 
      html += '<div id="sketchpad_container" style="display:none">';
      html += '<canvas id="sketchpad" style="display:none"></canvas>';
      html += '</div>'; 

      // display prompt if there is one
      if (trial.prompt !== null) {
        var html = '<div id="prompt">' + trial.prompt + '</div>';
      }         

      // display label
      html += '<div id="label_container" style="display:none"><p id="cue_label"> "'+ trial.cue_label +'"</p></div>';

      // place cue image inside the cue image container (which has fixed location)
      html += '<div id="cue_container" style="display:none">';
        // display image if the condition is 'photo'
        if (trial.condition == 'photo') {
            // embed images inside the response button divs
            var cue_html_replaced = trial.cue_html.replace('imageURL', trial.cue_image_url);
            html += cue_html_replaced;        
        } 
      html += '</div>'; 

      // display button to submit drawing when finished
      html += '<button id="submit_button" class="green" style="display:none"> submit </button>'

      // actually assign html to display_element.innerHTML
      display_element.innerHTML = html;

      // reset global current stroke number variable
      currStrokeNum = 0;  

      // record trial start timestamp
      startTrialTime = Date.now();

      // add event listener to submit button once response window opens
      submit_button.addEventListener('click', end_trial);
      submit_button.disabled = true; // button is disabled until at least one stroke       

      // instantiate new sketchpad
      sketchpad = new Sketchpad();
      sketchpad.setupTool();

      // if you need to reposition the label_container do so now
      if (trial.condition == 'label') {
        var label = display_element.querySelector('#label_container');
        label.style.top = "360px";
      }

      // show the cues
      jsPsych.pluginAPI.setTimeout(function() {
        $('#sketchpad_container').fadeIn('fast');
        $('#label_container').fadeIn('fast');        
        $('#cue_container').fadeIn('fast');       
      }, 100);

      // wait for the cue duration, then trigger display of the drawing canvas
      // setTimeout(function() {show_canvas(); }, trial.cue_duration);  
      jsPsych.pluginAPI.setTimeout(function() {show_canvas();}, trial.cue_duration);

    }  

    function show_canvas() {       

      // record timestamp for start of response window
      startResponseTime = Date.now(); 

      // show the canvas
      $('#sketchpad').fadeIn('fast');

      // show the submit button
      $('#submit_button').fadeIn('fast');        

    }

    // actually send stroke data back to server to save to db
    function send_stroke_data(path) {
      // path.selected = false;
      var svgString = path.exportSVG({asString: true});
      console.log('path',path);
      console.log('svgString',svgString);
      
      // specify other metadata
      stroke_data = {
          dbname:'drawbase',
          colname: 'photodraw2', 
          iterationName: 'development',
          eventType: 'stroke',
          svg: svgString,
          category: trial.cue_label,
          trialNum: trial.trialNum,
          startResponseTime: startResponseTime,
          startStrokeTime: startStrokeTime,
          endStrokeTime: endStrokeTime,
          time: Date.now()
      };

      // send stroke data to server
      socket.emit('stroke',stroke_data);

    }

    // triggered either when submit button is clicked or time runs out
    // sends trial data to database
    function end_trial() {

      // disable button to prevent double firing
      submit_button.disabled=true;

      // sketch rendering to base64 encoding
      var dataURL = display_element.querySelector('#sketchpad').toDataURL();
      dataURL = dataURL.replace('data:image/png;base64,','');      

      // data saving
      var trial_data = {
          dbname:'drawbase',
          colname: 'photodraw2', 
          iterationName: 'development',
          eventType: 'click',
          category: trial.cue_label,
          trialNum: trial.trialNum,        
          cue_url: trial.cue_url,
          pngData: dataURL,
          startTrialTime: startTrialTime,        
          endTrialTime: Date.now()      
      };

      // clear the HTML in the display element
      display_element.innerHTML = '';

      // clear sketchpad canvas and reset drawing state vars
      project.activeLayer.removeChildren();

      // end trial
      jsPsych.finishTrial(trial_data);

    }

    ///////// DRAWING PARAMS ///////////

    // globals
    var drawingAllowed = true;
    var submitAllowed = false; // allow submission once there is at least one stroke
    var strokeColor = 'black';
    var strokeWidth = 5;
    var simplifyParam = 10;
    var currStrokeNum = 0;

    ///////// CORE DRAWING FUNCTIONS ///////////

    function Sketchpad() {
      // initialize paper.js      
      paper.setup('sketchpad');
      paper.view.viewSize.width = 448;
      paper.view.viewSize.height = 448;
    };

    Sketchpad.prototype.setupTool = function() {    
      // initialize path and tool
      var path;
      var tool = new Tool();

      // define mouse interaction events
      tool.onMouseDown = function(event) {        
        startStroke(event);        
      }

      tool.onMouseDrag = function(event) {
        if (drawingAllowed && !_.isEmpty(path)) {
          var point = event.point.round();
          currMouseX = point.x;
          currMouseY = point.y;
          path.add(point);
        }
      };      

      tool.onMouseUp = function (event) {
        endStroke(event);                
      }

      // startStroke
      function startStroke(event) {
          if (drawingAllowed) {
            startStrokeTime = Date.now();
            // If a path is ongoing, send it along before starting this new one
            if(!_.isEmpty(path)) {
              endStroke(event);
            }

            var point = (event ? event.point.round() :
             {x: currMouseX, y: currMouseY});
              path = new Path({
                segments: [point],
                strokeColor: strokeColor,
                strokeWidth: strokeWidth
              });
          }
        };

      // endStroke
      function endStroke(event) {
        // Only send stroke if actual line (single points don't get rendered)
        if (drawingAllowed && path.length > 1) {
          
          // allow submission of button if endStroke is called 
          submit_button.disabled=false;

          // record end stroke time
          endStrokeTime = Date.now();
          
          // Increment stroke num
          currStrokeNum += 1;

          // Simplify path to reduce data sent
          path.simplify(simplifyParam);

          // send stroke data to db.
          send_stroke_data(path);

          // reset path
          path = [];
        }
      }
    
    }

  };

  return plugin;
})();


