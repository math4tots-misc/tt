/* jshint esversion: 6 */

(function(exports) {
"use strict";

// handle special key bindings that are IDE wide, not just specific to
// the editor.

const saveModifier =
    navigator.platform.startsWith("Mac") ? "metaKey" : "ctrlKey";

class KeyHandler {
  constructor(selector) {
    this._node = $(selector);
  }

  init() {
    const keyHandler = this;
    // CodeMirror doesn't properly take control of Command key bindings
    // So we use jquery for those
    this._node.keydown(function(event) {
      // If modifier key is pressed and the S key is pressed
      // run save function. 83 is the key code for S.
      if(event[saveModifier] && event.which == 83) {
        // TODO: Figure out if 'preventDefault' is actually necessary.
        event.preventDefault();
        if (keyHandler._saveCallback) {
          keyHandler._saveCallback();
        }
        return false;
      }
    });
  }

  onSave(callback) {
    this._saveCallback = callback;
  }
}

exports.set("KeyHandler", KeyHandler);

})(lib);

