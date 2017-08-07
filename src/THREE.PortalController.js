THREE.PortalController = function (settings) {
  this.camera = settings.camera;
  this.renderer = settings.renderer;
  this.renderer.autoClear = false;
  this.portalRenderDepth = 1;
  
  this.cameraControls = new THREE.PortalControls(this.camera);
  this.cameraControlsObject = this.cameraControls.getObject();
  
  this._stencilScene = new THREE.Scene();
  
  this._nameToSceneMap = {};
  this._sceneNameToPortalsMap = {};
  this._allPortals = [];
  this._singlePortal = [];
  
  this._raycaster = new THREE.Raycaster();
};
THREE.PortalController.prototype = {
  registerScene:function(name, scene) {
    scene.name = name;
    
    this._nameToSceneMap[scene.name] = scene;
    this._sceneNameToPortalsMap[scene.name] = [];
  },
  // createPortalFromPlane
  createPortal:function(width, height, sceneName) {
    var portal = new THREE.Portal(width, height);
    
    if (sceneName) {
      this.addPortalToScene(sceneName, portal);
    }
    
    return portal;
  },
  addPortalToScene:function(sceneOrName, portal) {
    var scene = (typeof sceneOrName === 'string') ? this._nameToSceneMap[sceneOrName] : sceneOrName;
    portal.setScene(scene);
    portal.parent = this._stencilScene;
    
    this._sceneNameToPortalsMap[scene.name].push(portal);
    this._allPortals.push(portal);
  },
  removePortal:function(portal) {
    
  },
  setCurrentScene:function(name) {
    this._currentScene = this._nameToSceneMap[name];
    this._currentScenePortals = this._sceneNameToPortalsMap[name];
  },
  setCameraPosition:function(x, y, z) {
    this.cameraControls.getObject().position.set(x || 0, y || 0, z || 0);
  },
  update:function(dt) {
    this.cameraControls.updateVelocity(dt * 1000);
    
    var i,
      portal,
      intersectedPortal;
    
    for (i = 0; i < this._allPortals.length; i++) {
      this._allPortals[i].updateMatrix();
      this._allPortals[i].updateMatrixWorld(true);
    }
    
    for (i = 0; i < this._currentScenePortals.length; i++) {
      portal = this._currentScenePortals[i];
      
      if (this.checkCameraPortalIntersection(portal)) {
        intersectedPortal = portal;
      }
    }
    
    if (intersectedPortal) {
      this.teleport(intersectedPortal);
      this.setCurrentScene(intersectedPortal.destinationPortal.scene.name);
    }
    
    this.cameraControls.updatePosition();
  },
  checkCameraPortalIntersection:(function() {
    var controlsPosition = new THREE.Vector3();
    
    var motion = new THREE.Vector3();
    
    return function(portal) {
      this.cameraControls.getPosition(controlsPosition);
      
      // todo fix volume face toggle
      var portalPosition = portal.position.clone(),
        distance = portalPosition.sub(controlsPosition).length();
      portal.toggleVolumeFaces(distance < 10);
      
      this.cameraControls.getMotion(motion);

      return this.checkPortalIntersection(controlsPosition, motion, portal);
    };
  })(),
  checkPortalIntersection:function(start, motion, portal) {
    this._raycaster.set(start, motion);
    this._raycaster.far = motion.length();
    return this._raycaster.intersectObject(portal, false).length > 0;
  },
  teleport:(function() {
    var m = new THREE.Matrix4(),
      p = new THREE.Vector4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector4(),
      e = new THREE.Euler(0, 0, -1, "YXZ");
    
    return function(portal) {
      console.log('Teleporting', portal);
      e.set(0, 0, -1);
      m.copy(this.computePortalViewMatrix(portal));
      m.decompose(p, q, s);
      e.setFromQuaternion(q);
      
      this.cameraControlsObject.position.copy(p);
      this.cameraControls.setDirection(e);
    };
  })(),
  pushCamera: function() {
    if (!this._cameraStack)
      this._cameraStack = [];
    var cameraMatrixWorld = new THREE.Matrix4(),
      cameraMatrixWorldInverse = new THREE.Matrix4(),
      cameraProjectionMatrix = new THREE.Matrix4();
    cameraMatrixWorld.copy(this.camera.matrixWorld);
    cameraMatrixWorldInverse.copy(this.camera.matrixWorldInverse);
    cameraProjectionMatrix.copy(this.camera.projectionMatrix);
    this._cameraStack.push({
      cameraMatrixWorld,
      cameraMatrixWorldInverse,
      cameraProjectionMatrix
    });
  },
  popCamera: function() {
    this.setCamera(this._cameraStack.pop());
  },
  peekCamera: function() {
    this.setCamera(this._cameraStack[this._cameraStack.length - 1]);
  },
  setCamera: function(n) {
    this.camera.matrixWorld.copy(n.cameraMatrixWorld);
    this.camera.matrixWorldInverse.copy(n.cameraMatrixWorldInverse);
    this.camera.projectionMatrix.copy(n.cameraProjectionMatrix);
  },
  lookThrough: function(portal) {
    this.camera.matrixWorld.copy(this.computePortalViewMatrix(portal));
    this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);
    this.camera.projectionMatrix.copy(
      this.computePortalProjectionMatrix(portal.destinationPortal));
  },
  render:(function() {
    function renderPortals(gl, scene, portalToIgnore, portalRenderDepth, stencilValue, portalsSoFar) {
      if (portalRenderDepth <= 0)
        return;
      this.pushCamera();
      let portal,
        i,
        scenePortals = this._sceneNameToPortalsMap[scene.name]
          .filter(p => p !== portalToIgnore),
        l = scenePortals.length;
      for (i = 0; i < l; ++i) {
        const newPortalValue = portalsSoFar | stencilValue;
        // First, draw the portal to the stencil layer:
        this._singlePortal[0] = portal = scenePortals[i];
        this._stencilScene.children = this._singlePortal;
        gl.stencilFunc(gl.EQUAL, newPortalValue, portalsSoFar);
        this.renderer.render(this._stencilScene, this.camera);
        // Draw the portals on the other side
        this.lookThrough(portal);
        renderPortals.call(this, gl,
          portal.destinationPortal.scene,
          portal.destinationPortal,
          portalRenderDepth - 1,
          stencilValue << 1,
          newPortalValue);
        // restore original camera matrices for the next portal
        this.peekCamera();
        stencilValue <<= 1;
      }
      // Clear the stack entry we pushed at the start.
      this.popCamera();
    }

    function renderScene(gl, scene, portalToIgnore, portalRenderDepth, stencilValue, portalsSoFar) {

      let scenePortals = this._sceneNameToPortalsMap[scene.name]
        .filter(p => p !== portalToIgnore);

      if (portalRenderDepth > 0) {
        this.pushCamera();
        let portal,
          i,
          l = scenePortals.length;
        for (i = 0; i < l; ++i) {
          portal = scenePortals[i];
          // Draw the scene on the other side
          this.lookThrough(portal);
          renderScene.call(this, gl,
            portal.destinationPortal.scene,
            portal.destinationPortal,
            portalRenderDepth - 1,
            stencilValue << 1,
            portalsSoFar | stencilValue);
          // restore original camera matrices for the next portal
          this.peekCamera();
          stencilValue <<= 1;
        }
        // Reset the stack
        this.popCamera();
      }

      // OK, now we've drawn all the through-portal views, we can draw the current scene.
      // (Except where there's a portal.)
      gl.stencilFunc(gl.EQUAL, portalsSoFar, portalsSoFar);
      this.renderer.clear(false, true, false);

      // We don't want to draw anything behind a portal, so first we draw all the
      // portals in the current scene into the depth buffer:
      gl.colorMask(false, false, false, false);
      gl.depthMask(true);
      this._stencilScene.children = scenePortals;
      this.renderer.render(this._stencilScene, this.camera);
      
      // finally, render the actual world.
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      this.renderer.render(scene, this.camera);
    }
    
    return function() {
      var gl = this.renderer.context;
      // make sure camera matrix is up to date
      this.cameraControlsObject.updateMatrix();
      this.cameraControlsObject.updateMatrixWorld(true);
      // full clear (color, depth and stencil)
      this.renderer.clear(true, true, true);
      // enable stencil test
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0xFF);

      // OK, first we are going to draw all the portals to the stencil layer.
      // We do not care at this stage about depth sorting
      // because we can't do it properly at the real draw phase
      // so we're going to have to fake it with clever level design anyway.
      // It's a pain but it saves us some computation here I guess?
      gl.colorMask(false, false, false, false);
      gl.depthMask(false);
      gl.depthFunc(gl.ALWAYS);
      gl.stencilOp(gl.KEEP, gl.REPLACE, gl.REPLACE);
      renderPortals.call(this, gl,
        this._currentScene,
        null,
        this.portalRenderDepth,
        0x01,
        0x00);
        
      // Now we are going to draw the scenery so let's just do it normally
      // (stencil tests aside)
      gl.depthMask(true);
      gl.depthFunc(gl.LEQUAL);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      renderScene.call(this, gl,
        this._currentScene,
        null,
        this.portalRenderDepth,
        0x01,
        0x00);
    };
  })(),
  computePortalViewMatrix:function(portal) {
    return this.applyPortalMatrix(
      this.camera.matrixWorldInverse,
      portal);
  },
  applyPortalMatrix:(function() {
    var rotationYMatrix = new THREE.Matrix4().makeRotationY(Math.PI),
      dstInverse = new THREE.Matrix4(),
      srcToCam = new THREE.Matrix4(),
      srcToDst = new THREE.Matrix4(),
      result = new THREE.Matrix4();
    
    return function(matrix, portal) {
      var src = portal,
        dst = portal.destinationPortal;
      
      srcToCam.multiplyMatrices(matrix, src.matrix);
      dstInverse.getInverse(dst.matrix);
      srcToDst.copy(srcToCam)
        .multiply(rotationYMatrix)
        .multiply(dstInverse);
      
      result.getInverse(srcToDst);
      
      return result;
    }
  })(),
  computePortalProjectionMatrix:(function() {
    var dstRotationMatrix = new THREE.Matrix4(),
      normal = new THREE.Vector3(),
      clipPlane = new THREE.Plane(),
      clipVector = new THREE.Vector4(),
      q = new THREE.Vector4(),
      projectionMatrix = new THREE.Matrix4();
    
    function sign(s) {
      if (s > 0) return 1;
      if (s < 0) return -1;
      return 0;
    }
    
    //for math, see http://www.terathon.com/code/oblique.html
    return function(dst) {
      dstRotationMatrix.identity();
      dstRotationMatrix.extractRotation(dst.matrix);
      
      normal.set(0, 0, 1).applyMatrix4(dstRotationMatrix);
      
      clipPlane.setFromNormalAndCoplanarPoint(normal, dst.position);
      clipPlane.applyMatrix4(this.camera.matrixWorldInverse);
      
      clipVector.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
      
      projectionMatrix.copy(this.camera.projectionMatrix);
      
      q.x = (sign(clipVector.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
      q.y = (sign(clipVector.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
      q.z = -1.0;
      q.w = (1.0 + projectionMatrix.elements[10]) / this.camera.projectionMatrix.elements[14];
      
      clipVector.multiplyScalar(2 / clipVector.dot(q));
      
      projectionMatrix.elements[2] = clipVector.x;
      projectionMatrix.elements[6] = clipVector.y;
      projectionMatrix.elements[10] = clipVector.z + 1.0;
      projectionMatrix.elements[14] = clipVector.w;
      
      return projectionMatrix;
    }
  })(),
  setSize:function(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    for (var i = 0; i < this._allPortals.length; i++) {
      this._allPortals[i].setVolumeFromCamera(this.camera);
    }
    
    this.renderer.setSize(width, height);
  },
  enable:function() {
    this.cameraControls.enabled = true;
  },
  disable:function() {
    this.cameraControls.enabled = false;
  }
};
