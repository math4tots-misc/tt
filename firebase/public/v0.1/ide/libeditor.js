/* jshint esversion: 6 */

(function(exports) {
"use strict";

class Editor {
  constructor(selector, options) {
    options = options || {};
    this._node = $(selector);
    if (this._node.prop("tagName") !== "TEXTAREA") {
      throw new Error(
          "Editor must be a textarea element but got " +
          this._node.prop("tagName"));
    }
    this._mode = options.mode;
    this._docs = Object.create(null);
    this._fallbackdoc = CodeMirror.Doc(
        options.noDocumentMessage || "No selected file", "clike");
    this._currentDocId = null;
    this._cm = CodeMirror.fromTextArea(this._node.get(0), {
      value: this._fallbackdoc,
      lineNumbers: true,
      keyMap: "sublime",
      autoCloseBrackets: true,
      matchBrackets: true,
      showCursorWhenSelecting: true,
      theme: "monokai",
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
  getDocData() {
    const data = [];
    for (const id in this._docs) {
      const doc = this._docs[id];
      data.push({
        "id": id,
        "contents": doc.getValue(),
      });
    }
    return data;
  }
  getCurrentDocId() {
    return this._currentDocId;
  }
  getContentsOfDocWithId(id) {
    if (this._docs[id] === undefined) {
      throw new Error("No such doc with id: " + id);
    }
    return this._docs[id].getValue();
  }
  update(docs, currentDocId) {
    const oldDocs = this._docs;
    this._docs = Object.create(null);
    for (const {id, contents} of docs) {
      if (oldDocs[id]) {
        this._docs[id] = oldDocs[id];
        if (contents !== undefined &&
            this._docs[id].getValue() !== contents) {
          this._docs[id].setValue(contents);
        }
      } else {
        this._docs[id] = CodeMirror.Doc(contents, this._mode);
      }
    }
    if (currentDocId) {
      if (!this._docs[currentDocId]) {
        throw new Error("No such doc id: " + currentDocId);
      }
      this._cm.swapDoc(this._docs[currentDocId]);
      this._cm.setOption("readOnly", false);
      this._currentDocId = currentDocId;
    } else {
      this._cm.swapDoc(this._fallbackdoc);
      this._cm.setOption("readOnly", true);
      this._currentDocId = null;
    }
  }
  reset() {
    this._docs = Object.create(null);
    this._currentDocId = null;
  }
  setVimMode() {
    toastr.info("Setting keyMap to 'vim' mode");
    this._cm.setOption("keyMap", "vim");
  }
  setSublimeMode() {
    toastr.info("Setting keyMap to 'sublime' mode");
    this._cm.setOption("keyMap", "sublime");
  }
  getKeyMap() {
    return this._cm.getOption("keyMap");
  }
}

exports.set("Editor", Editor);

})(lib);

