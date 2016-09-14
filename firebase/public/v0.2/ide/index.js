/* jshint esversion: 6 */

$(document).ready(function() {
"use strict";

firebase.initializeApp({
  apiKey: "AIzaSyChhIfmjyrUjOwbJqBWbuX4F-WysHgMzRE",
  authDomain: "eng-misc.firebaseapp.com",
  databaseURL: "https://eng-misc.firebaseio.com",
  storageBucket: "eng-misc.appspot.com",
});

// TODO: Add EMACS mode for editor.

// TODO: When user sees a public project, they will be able to type
// into editor. Those changes won't be saved though. This could be considered
// a feature (viewer can make transient changes), but I might
// want to consider making the editor readonly when user is viewing
// a project wihtout write permissions.

const main = lib.asyncf(function*() {

  $("#before-login").show();
  $("#after-login").hide();

  $("#login-button").click(() => lib.signInWithRedirect());

  yield lib.asyncWaitForUserLogin();

  $("#before-login").hide();
  $("#after-login").show();

  const layout = new lib.Layout("#after-login");
  const fileTreeView = new lib.FileTreeView("#file-tree");
  const editor = new lib.Editor("#editor", {mode: "text/x-c++src"});
  const stdout = new lib.Stdout("#stdout", {mode: "clike", readOnly: true});
  const projectData = new lib.ProjectData();
  const userData = new lib.UserData();
  const renameFileDialog = new lib.Dialog("#rename-file-dialog");
  const newFileDialog = new lib.Dialog("#new-file-dialog");
  const renameProjectDialog = new lib.Dialog("#rename-project-dialog");
  const keyHandler = new lib.KeyHandler(document);
  const chooseProjectDialog =
      new lib.ChooseProjectDialog("#choose-project-dialog");

  const hash = window.location.hash;

  const initKeyMap = yield userData.asyncGetKeyMap() || "sublime";

  if (initKeyMap === "vim") {
    editor.setVimMode();
  } else if (initKeyMap !== null && initKeyMap !== "sublime") {
    toastr.warning(
        "Unrecognized keyMap: " + initKeyMap +
        " defaulting to sublime mode");
  }

  const initProjectId =
      hash && hash.startsWith("#project") ?
      hash.slice("#project".length) :
      yield userData.asyncGetMostRecentProjectId();

  const didLoadProject = yield projectData.asyncLoad(initProjectId);
  if (didLoadProject) {
    toastr.info("Loaded project: " + projectData.getProjectName());
  } else {
    toastr.info("Created new project: " + projectData.getProjectName());
  }

  const mockConsole = {
    "log": (x) => {
      stdout.append(x + "\n");
    },
    "error": (x) => {
      mockConsole.log(x);
    }
  };

  keyHandler.init();

  // TODO: handle dependencies across projects.

  const asyncSave = lib.asyncf(function*() {
    flushView();
    yield userData.asyncSetKeyMap(editor.getKeyMap());
    const id = projectData.getProjectId();
    const name = projectData.getProjectName();
    yield userData.asyncSetMostRecentProjectId(id);
    yield userData.asyncSetProjectInfo(id, {"id": id, "name": name});
    yield projectData.asyncSave();
    if (projectData.isPublic()) {
      yield userData.asyncSetPublicProjectInfo(id, {"id": id, "name": name});
    }
    toastr.info("Project " + name + " saved!");
  });

  const asyncTrySave = lib.asyncf(function*() {
    try {
      yield asyncSave();
    } catch (e) {
      toastr.warning("Save failed: " + e.toString());
    }
  });

  function updateView() {
    const projectId = projectData.getProjectId();
    const projectName = projectData.getProjectName();
    const currentFile = projectData.getCurrentFilename();
    const currentFileId = projectData.getCurrentFileId();
    const fileIds = projectData.getFileIds();
    const filenames = projectData.getFilenames();

    document.title = projectName;
    window.location.hash = "project" + projectId;

    fileTreeView.update(projectName, filenames, currentFile);

    editor.update(fileIds.map(id => ({
        "id": id,
        "contents": projectData.getContentsOfFileWithId(id),
    })), currentFileId);
  }

  function flushView() {
    const currentDocId = editor.getCurrentDocId();
    if (currentDocId !== null) {
      projectData.setContentsOfFileWithId(
          currentDocId,
          editor.getContentsOfDocWithId(currentDocId));
    }
  }

  const asyncGetCodeUriPairs = lib.asyncf(function*() {
    const depsTable = yield projectData.asyncGetAllDependencies();
    const codeUriPairs = [];
    const deps = Object.keys(depsTable).map(id => depsTable[id]);
    for (const pdata of deps) {
      for (const cup of pdata.getCodeUriPairs()) {
        codeUriPairs.push(cup);
      }
    }
    if (projectData.fileWithNameExists("_main.tt")) {
      codeUriPairs.push([
          projectData.getContentsOfFileWithName("_main.tt"),
          "_main.tt (" + projectData.getProjectName() + ")",
      ]);
    }
    return codeUriPairs;
  });

  fileTreeView.onRunProject(() => {
    lib.runAsyncf(function*() {
      try {
        yield asyncTrySave();
        stdout.clear();
        const codeUriPairs = yield asyncGetCodeUriPairs();
        const uriCodePairs = codeUriPairs.map(pair => [pair[1], pair[0]]);
        (function() {
          const console = mockConsole;
          // jshint evil: true
          eval(tt.compile(uriCodePairs));
        })();
        toastr.info("Project run successfully");
      }  catch(e) {
        mockConsole.error(e.stack);
        toastr.warning("Run ended with an error");
      }
    });
  });

  fileTreeView.onTranspileProject(() => {
    lib.runAsyncf(function*() {
      yield asyncTrySave();
      stdout.clear();
      try {
        const codeUriPairs = yield asyncGetCodeUriPairs();
        const uriCodePairs = codeUriPairs.map(pair => [pair[1], pair[0]]);
        mockConsole.log(tt.compile(uriCodePairs));
        toastr.info("Project transpiled successfully");
      }  catch(e) {
        mockConsole.error(e.stack);
        toastr.warning("Transpile ended with an error");
      }
    });
  });

  fileTreeView.onSelectFile(newFilename => {
    flushView();
    projectData.setCurrentFileWithName(newFilename);
    updateView();
  });

  fileTreeView.onRenameProject(() => {
    flushView();
    const oldProjectName = projectData.getProjectName();
    $("#rename-project-name").val(oldProjectName);
    renameProjectDialog.open(oldProjectName);
  });

  fileTreeView.onDeleteFile(filename => {
    flushView();
    projectData.deleteFileWithName(filename);
    updateView();
  });

  fileTreeView.onRenameFile(oldFilename => {
    flushView();
    $("#rename-file-name").val(oldFilename);
    renameFileDialog.open(oldFilename);
  });

  fileTreeView.onNewFile(() => {
    flushView();
    $("#new-file-name").val("");
    newFileDialog.open();
  });

  fileTreeView.onChooseProject(() => {
    lib.runAsyncf(function*() {
      yield asyncTrySave();
      const infos = yield userData.asyncGetProjectInfos();
      const publicInfos = yield userData.asyncGetPublicProjectInfos();
      chooseProjectDialog.setProjectInfos(infos, publicInfos);
      chooseProjectDialog.open();
    });
  });

  fileTreeView.onChooseVimMode(() => {
    lib.runAsyncf(function*() {
      yield userData.asyncSetKeyMap("vim");
    });
    editor.setVimMode();
  });

  fileTreeView.onChooseSublimeMode(() => {
    lib.runAsyncf(function*() {
      yield userData.asyncSetKeyMap("sublime");
    });
    editor.setSublimeMode();
  });

  renameFileDialog.onSubmit(oldName => {
    const newName = $("#rename-file-name").val();
    projectData.renameFileWithName(oldName, newName);
    renameFileDialog.close();
    updateView();
  });

  newFileDialog.onSubmit(() => {
    const newName = $("#new-file-name").val();
    projectData.makeNewFile(newName);
    newFileDialog.close();
    updateView();
  });

  renameProjectDialog.onSubmit(oldName => {
    projectData.setProjectName($("#rename-project-name").val());
    renameProjectDialog.close();
    updateView();
  });

  chooseProjectDialog.onProjectChosen(projectInfo => {
    lib.runAsyncf(function*() {
      yield projectData.asyncLoad(projectInfo.id);
      updateView();
      chooseProjectDialog.close();
    });
  });

  chooseProjectDialog.onNewProject(() => {
    lib.runAsyncf(function*() {
      yield projectData.asyncLoad();
      updateView();
      chooseProjectDialog.close();
    });
  });

  chooseProjectDialog.onDeleteProject(projectInfo => {
    const id = projectInfo.id;
    userData.deleteProjectInfo(id);
    lib.deleteFromFirebase(lib.getProjectDataPath(id));
    lib.runAsyncf(function*() {
      const infos = yield userData.asyncGetProjectInfos();
      const publicInfos = yield userData.asyncGetPublicProjectInfos();
      chooseProjectDialog.setProjectInfos(infos, publicInfos);
    });
  });

  keyHandler.onSave(() => {
    lib.runAsyncf(function*() {
      try {
        yield asyncSave();
      } catch (e) {
        toastr.error("Save failed: " + e.toString());
      }
    });
  });

  updateView();
});

main().then(() => null);
});

