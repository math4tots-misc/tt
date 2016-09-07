/* jshint esversion: 6 */

(function(exports) {
"use strict";

class FileTreeView {
  constructor(selector) {
    this._node = $(selector);
    if (this._node.prop("tagName") !== "UL") {
      throw new Error(
          "File tree must be a ul element but got " +
          this._node.prop("tagName"));
    }
    const fileTree = this;
    $.contextMenu({
      "selector": ".folder-name",
      "trigger": "left",
      // HACK: The z-index of the layout dividers is 2.
      // So if the z-index of the context-menu-list isn't bigger than that,
      // it will get clipped
      "zIndex": 3,
      "items": {
        // HACK: Unfortunately, the convention here seems to require
        // that we depend on the fact that in javascript when iterating over
        // objects we get the keys in the order of insertion.
        // This is not strictly part of the ECMA standard, but widely
        // implemented in modern browsers (as of 2016).
        "run": {
          "name": "Run Project",
          "callback": function(key, opt) {
            if (fileTree._runProjectCallback) {
              fileTree._runProjectCallback();
            }
          },
        },
        "transpile": {
          "name": "Transpile Project",
          "callback": function(key, opt) {
            if (fileTree._transpileProjectCallback) {
              fileTree._transpileProjectCallback();
            }
          }
        },
        "newFile": {
          "name": "New File",
          "callback": function(key, opt) {
            if (fileTree._newFileCallback) {
              fileTree._newFileCallback();
            }
          },
        },
        "renameProject": {
          "name": "Rename Project",
          "callback": function(key, opt) {
            if (fileTree._renameProjectCallback) {
              fileTree._renameProjectCallback();
            }
          },
        },
        "chooseProject": {
          "name": "Choose Project",
          "callback": function(key, opt) {
            if (fileTree._chooseProjectCallback) {
              fileTree._chooseProjectCallback();
            }
          },
        },
        "vimMode": {
          "name": "Set Editor to VIM mode",
          "callback": function(key, opt) {
            if (fileTree._chooseVimModeCallback) {
              fileTree._chooseVimModeCallback();
            }
          }
        },
        "sublimeMode": {
          "name": "Set Editor to Sublime mode",
          "callback": function(key, opt) {
            if (fileTree._chooseSublimeModeCallback) {
              fileTree._chooseSublimeModeCallback();
            }
          },
        }
      },
    });
    $.contextMenu({
      "selector": ".file-listing",
      "zIndex": 3, // HACK: See above
      "items": {
        "delete": {
          "name": "Delete",
          "callback": function(key, opt) {
            if (fileTree._deleteFileCallback) {
              // NOTE: $(this) is the element that was clicked on
              // So $(this).text() refers to the text that is shown,
              // i.e. the filename
              fileTree._deleteFileCallback($(this).text());
            }
          },
        },
        "rename": {
          "name": "Rename",
          "callback": function(key, opt) {
            if (fileTree._renameFileCallback) {
              // NOTE: $(this) is the element that was clicked on
              // So $(this).text() refers to the text that is shown,
              // i.e. the filename
              fileTree._renameFileCallback($(this).text());
            }
          }
        },
      }
    });
  }
  update(projectName, filenames, activeFile) {
    const root = $('<ul></ul>');
    for (const filename of filenames) {
      const item = $('<li class="file-listing"></li>');
      if (filename === activeFile) {
        item.addClass("active-file-listing");
      }
      item.text(filename);
      root.append(item);
    }
    const rootHeader = $('<div class="folder-name"></div>');
    rootHeader.text(projectName);
    const rootContainer = $('<li></li>');
    rootContainer.append(rootHeader);
    rootContainer.append(root);
    this._node.empty();
    this._node.append(rootContainer);

    const fileTree = this;
    $(".file-listing").click(function() {
      $(".active-file-listing").removeClass("active-file-listing");
      $(this).addClass("active-file-listing");
      if (fileTree._selectFileCallback) {
        fileTree._selectFileCallback($(this).text());
      }
    });
  }
  onRunProject(callback) {
    this._runProjectCallback = callback;
  }
  onTranspileProject(callback) {
    this._transpileProjectCallback = callback;
  }
  onSelectFile(callback) {
    this._selectFileCallback = callback;
  }
  onRenameProject(callback) {
    this._renameProjectCallback = callback;
  }
  onDeleteFile(callback) {
    this._deleteFileCallback = callback;
  }
  onRenameFile(callback) {
    this._renameFileCallback = callback;
  }
  onNewFile(callback) {
    this._newFileCallback = callback;
  }
  onChooseProject(callback) {
    this._chooseProjectCallback = callback;
  }
  onChooseVimMode(callback) {
    this._chooseVimModeCallback = callback;
  }
  onChooseSublimeMode(callback) {
    this._chooseSublimeModeCallback = callback;
  }
}

exports.set("FileTreeView", FileTreeView);

})(lib);

