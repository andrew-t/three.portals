THREE.Portal = function(width, height) {
  var geometry = new THREE.PortalGeometry(width, height);
  var material = [
    new THREE.MeshBasicMaterial({
      side: THREE.FrontFace,
      color: 0xffffff
    }),
    new THREE.MeshBasicMaterial({
      visible: false,
      side: THREE.FrontFace,
      color: 0xffffff
    })
  ];

  THREE.Mesh.call(this, geometry, material);
};
THREE.Portal.prototype = Object.create(THREE.Mesh.prototype);
THREE.Portal.prototype.constructor = THREE.Portal;

THREE.Portal.prototype.setVolumeFromCamera = function(camera) {
  this.geometry.setVolume(camera.fov, camera.aspect, camera.near);
};
THREE.Portal.prototype.toggleVolumeFaces = function(state) {
  this.volumeFacesVisible = state;
  this.material[1].visible = state;
};
THREE.Portal.prototype.setScene = function(scene) {
  this.scene = scene;
};
THREE.Portal.prototype.setDestinationPortal = function(portal) {
  this.destinationPortal = portal;
};
