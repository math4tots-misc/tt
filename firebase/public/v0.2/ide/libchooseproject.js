/* jshint esversion: 6 */

(function(exports) {
"use strict";

class ChooseProjectDialog {
  constructor(selector) {
    this._node = $(selector);
    this._dialog = new lib.Dialog(this._node, {
      "buttons": {
        "newProject": {
          "text": "New Project",
          "click": () => {
            if (this._newProjectCallback) {
              this._newProjectCallback();
            }
          },
        },
      },
    });
    const dialog = this;
    $.contextMenu({
      "selector": ".choose-project-button",
      "items": {
        "delete": {
          "name": "Delete Project",
          "callback": function(key, opt) {
            if (dialog._deleteProjectCallback) {
              dialog._deleteProjectCallback($(this).data("project-info"));
            }
          },
        },
      },
    });
  }
  setProjectInfos(infos) {
    const fieldset = this._node.find("fieldset");
    fieldset.empty();
    const makeButton =
        (info) => $("<button></button>").text(info.name).click(() => {
          if (this._projectChosenCallback) {
            this._projectChosenCallback(info);
          }
        }).addClass("ui-button").addClass("choose-project-button")
        .data("project-info", info);
    for (const info of infos) {
      fieldset.append(makeButton(info));
    }
  }
  onProjectChosen(callback) {
    this._projectChosenCallback = callback;
  }
  onNewProject(callback) {
    this._newProjectCallback = callback;
  }
  onDeleteProject(callback) {
    this._deleteProjectCallback = callback;
  }
  open() {
    this._dialog.open();
  }
  close() {
    this._dialog.close();
  }
}

exports.set("ChooseProjectDialog", ChooseProjectDialog);

})(lib);

