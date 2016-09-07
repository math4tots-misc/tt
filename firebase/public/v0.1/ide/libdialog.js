/* jshint esversion: 6 */

(function(exports) {
"use strict";

class Dialog {
  constructor(selector, options) {
    options = options || {};
    this._node = $(selector);

    this._node.dialog({
      autoOpen: false,
      modal: true,
      buttons: options.buttons,
    });

    const dialog = this;
    this._form = this._node.find("form").on("submit", function(event) {
      event.preventDefault();
      if (dialog._submitCallback) {
        dialog._submitCallback(dialog._dialogInstanceData);
      }
      this._dialogInstanceData = null;
    });
  }

  open(dialogInstanceData) {
    this._dialogInstanceData = dialogInstanceData;
    this._node.dialog("open");
  }

  close() {
    this._node.dialog("close");
  }

  reset() {
    this._form[0].reset();
  }

  onSubmit(callback) {
    this._submitCallback = callback;
  }
}

exports.set("Dialog", Dialog);

})(lib);

