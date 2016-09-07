/* jshint esversion: 6 */

(function(exports) {
"use strict";

class Stdout {
  constructor(selector) {
    this._node = $(selector);
    if (this._node.prop("tagName") !== "TEXTAREA") {
      throw new Error(
          "Stdout must be a textarea element but got " +
          this._node.prop("tagName"));
    }
    this._cm = CodeMirror.fromTextArea(this._node.get(0), {
      value: this._fallbackdoc,
      lineNumbers: true,
      keyMap: "sublime",
      autoCloseBrackets: true,
      matchBrackets: true,
      showCursorWhenSelecting: true,
      theme: "monokai",
      mode: "clike",
      tabSize: 2,
      viewportMargin: Infinity,
      readOnly: true,
      lineWrapping: true,
    });
    this._cm.setOption("extraKeys", {
      Tab: function(cm) {
        var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces);
      },
    });
  }
  clear() {
    this._cm.setValue("");
  }
  append(x) {
    this._cm.replaceRange(x, CodeMirror.Pos(this._cm.lastLine()));
  }
}

exports.set("Stdout", Stdout);

})(lib);

