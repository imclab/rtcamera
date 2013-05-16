
(function() {
	window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;

	navigator.getMedia = ( navigator.getUserMedia ||
		navigator.webkitGetUserMedia ||
		navigator.mozGetUserMedia ||
		navigator.msGetUserMedia);

	// ---

	var video = null, webcamStream = null;
	var gl;
	var effects = [],
		activeEffect = null;
	var shaderProgram;
	var vertexPositionBuffer, uvBuffer, mvMatrix, pMatrix;
	var texture;

	if (navigator.getMedia) {

		video = document.createElement( 'video' );
		video.autoplay = true;

		var attempts = 0;

		video.addEventListener('loadeddata', function readyListener( event ) {
			findVideoSize();

			function findVideoSize() {
				
				if(video.videoWidth > 0 && video.videoHeight > 0) {

					video.removeEventListener('loadeddata', readyListener);
					init(video.videoWidth, video.videoHeight);

				} else {
					
					if(attempts < 10) {
						attempts++;
						setTimeout(findVideoSize, 500);
					} else {
						init(640, 480);
					}

				}
			}
		});

		navigator.getMedia({ video: true }, function (stream) {
			if(video.mozSrcObject !== undefined) {
				video.mozSrcObject = stream;
			} else {
				video.src = window.URL.createObjectURL(stream);
			}
			webcamStream = stream;
			video.play();
		}, function (error) {
			reportError(error);
		});

	} else {
		reportError('Native device media streaming (getUserMedia) not supported in this browser.');
	}

	function reportError(message) {

		var error = document.createElement('div');
		error.className = 'modal error';
		error.innerHTML = message.replace(/\n/g, '<br />');
		document.body.appendChild(error);

		if(webcamStream !== null) {
			webcamStream.stop();
		}

		if(video !== null) {
			video.pause();
			video.src = null;
		}

	}

	function init(width, height) {

		video.style.width = width + 'px';
		video.style.height = height + 'px';

		var canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		document.body.appendChild(canvas);
		
		try {

			gl = initWebGL(canvas);
			initWebGLBuffers();
			initTexture();
			initEffects(gl);
		
			render();

		} catch(e) {
			reportError(e.message);
		}
		
	}

	function initWebGL(canvas) {

		var gl = null;

		gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
		gl.viewportWidth = canvas.width;
		gl.viewportHeight = canvas.height;

		gl.shadersCache = {};

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		return gl;

	}

	function initWebGLBuffers() {
		vertexPositionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
		var vertices = [
			1.0,  1.0,  0.0,
			-1.0,  1.0,  0.0,
			1.0, -1.0,  0.0,
			-1.0, -1.0,  0.0
		];
		
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
		vertexPositionBuffer.itemSize = 3;
		vertexPositionBuffer.numItems = 4;

		uvBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);

		var uvs = [
			1.0, 1.0,
			0.0, 1.0,
			1.0, 0.0,
			0.0, 0.0
		];

		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
		uvBuffer.itemSize = 2;
		uvBuffer.numItems = 4;

		mvMatrix = mat4.create();
		pMatrix = mat4.create();
	}

	function initTexture() {
		texture = gl.createTexture();
		texture.image = video;
	}

	function getShader(glContext, id) {
		var shaderScript = document.getElementById(id);
		if (!shaderScript) {
			throw new Error('Shader with id = ' + id + ' could not be found');
		}

		var str = "";
		var k = shaderScript.firstChild;
		while (k) {
			if (k.nodeType == 3) {
				str += k.textContent;
			}
			k = k.nextSibling;
		}

		var shader;
		if (shaderScript.type == "x-shader/x-fragment") {
			shader = glContext.createShader(gl.FRAGMENT_SHADER);
		} else if (shaderScript.type == "x-shader/x-vertex") {
			shader = glContext.createShader(gl.VERTEX_SHADER);
		} else {
			throw new Error('Unrecognised shader type, id = ' + id);
		}

		glContext.shaderSource(shader, str);
		glContext.compileShader(shader);

		if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
			throw new Error('Shader <strong>' + id + '</strong> could not be compiled\n' + glContext.getShaderInfoLog(shader));
		}

		return shader;
	}

	function initEffects(gl) {

		var effectDefs = {
			'dithering': { vertex: 'vs', fragment: 'fs' },
			'posterize': { vertex: 'vs', fragment: 'fs_bw' }
		};

		var vertexCommonScript = document.getElementById('vs_common').textContent,
			fragmentCommonScript = document.getElementById('fs_common').textContent;


		for(var k in effectDefs) {
			var def = effectDefs[k];
			
			var vertexScript = document.getElementById( def.vertex ).textContent,
				fragmentScript = document.getElementById( def.fragment ).textContent;

			vertexScript = vertexCommonScript + vertexScript;
			fragmentScript = fragmentCommonScript + fragmentScript;

			var effect = new ImageEffect({
				vertexShader: vertexScript,
				fragmentShader: fragmentScript,
				attributes: {
					uv: {},
					position: {}
				},
				uniforms: {
					projectionMatrix: {},
					modelViewMatrix: {},
					map: {}
				}
			});

			effects.push(effect);
			effect.initialise(gl);

		}

		activeEffect = effects[1];

	}


	function initShaders() {
		var fragmentShader = getShader(gl, 'fs');
		var vertexShader = getShader(gl, 'vs');

		shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);

		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
			throw new Error('Shaders could not be linked');
		}

		gl.useProgram(shaderProgram);

		shaderProgram.projectionMatrixUniform = gl.getUniformLocation(shaderProgram, 'projectionMatrix');
		shaderProgram.modelViewMatrixUniform = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
		shaderProgram.mapUniform = gl.getUniformLocation(shaderProgram, 'map');
		shaderProgram.uvAttribute = gl.getAttribLocation(shaderProgram, 'uv');
		shaderProgram.positionAttribute = gl.getAttribLocation(shaderProgram, 'position');
		
		gl.enableVertexAttribArray(shaderProgram.uvAttribute);
		gl.enableVertexAttribArray(shaderProgram.positionAttribute);
	}

	function updateTexture(texture, video) {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	function render() {
		requestAnimationFrame( render );

		if( video.readyState === video.HAVE_ENOUGH_DATA ) {
			updateTexture(texture, video);
		}

		gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
		gl.clearColor(1.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		mat4.ortho(pMatrix, -1, 1, -1, 1, 0.1, 1000);
		
        mat4.identity(mvMatrix);
		mat4.translate(mvMatrix, mvMatrix, [0.0, 0.0, -1.0]);

		activeEffect.enable(gl);
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);

		gl.uniform1i(activeEffect.uniforms.map.id, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
		gl.vertexAttribPointer(activeEffect.attributes.uv.id, uvBuffer.itemSize, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
		gl.vertexAttribPointer(activeEffect.attributes.position.id, vertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);
		
		gl.uniformMatrix4fv(activeEffect.uniforms.projectionMatrix.id, false, pMatrix);
		gl.uniformMatrix4fv(activeEffect.uniforms.modelViewMatrix.id, false, mvMatrix);
        
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPositionBuffer.numItems);

		activeEffect.disable(gl);
		
	}
	
})();
