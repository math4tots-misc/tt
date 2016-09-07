/* jshint esversion: 6 */

(function(exports) {
"use strict";

class Layout {
  constructor(selector) {
    this._node = $(selector);
    this._layout = this._node.layout({
      applyDefaultStyles: true,

      // The default style makes the south panel too small.
      south__size: "20%",

      // 'cursorHotkey' are Ctrl-Arrow keys that opens and closes panels.
      // I don't really care for those, so we disable them here.
      enableCursorHotkey: false,
    });
  }
}

exports.set("Layout", Layout);

})(lib);

