/* jshint esversion: 6 */

(function(exports) {
"use strict";

const DEFAULT_PROJECT_NAME = "New Project";

const DEFAULT_CONFIG = `
{
  "dependencies": {},
  "public": true
}
`;

const DEFAULT_MAIN = `
import local.one.foo;

int main() {
  foo();
}
`;

const DEFAULT_LIB = `
package local.one;

void foo() {
  print("Hello world!");
}
`;



const PROJECT_PATH_ROOT = "v0_1/projects";

function getProjectDataPath(projectId) {
  if (!projectId) {
    throw new Error("Invalid projectId: " + projectId);
  }
  return PROJECT_PATH_ROOT + "/" + projectId;
}

class ProjectData {
  constructor() {
    this._data = null;
  }
  getFileIds() {
    const ids = [];
    for (const id in this._data.files) {
      ids.push(id);
    }
    return ids.sort();
  }
  getFilenames() {
    const names = [];
    for (const id in this._data.files) {
      names.push(this._data.files[id].name);
    }
    return names.sort();
  }
  getIdFromName(filename) {
    for (const id in this._data.files) {
      if (this._data.files[id].name === filename) {
        return id;
      }
    }
    throw new Error("No such file with name: " + filename);
  }
  fileWithIdExists(id) {
    return !!this._data.files[id];
  }
  _getFileObjectWithId(id) {
    if (!this.fileWithIdExists(id)) {
      throw new Error("No such file with id: " + id);
    }
    return this._data.files[id];
  }
  _getFileObjectWithName(name) {
    return this._getFileObjectWithId(this.getIdFromName(name));
  }
  getNameFromId(id) {
    return this._getFileObjectWithId(id).name;
  }
  fileWithNameExists(filename) {
    for (const id in this._data.files) {
      if (this._data.files[id].name === filename) {
        return true;
      }
    }
    return false;
  }
  deleteFileWithId(id) {
    this._getFileObjectWithId(id);  // Just to throw if no such file
    delete this._data.files[id];
    if (this._data.currentFileId === id) {
      this._data.currentFileId = null;
    }
  }
  deleteFileWithName(filename) {
    this.deleteFileWithId(this.getIdFromName(filename));
  }
  makeNewFile(filename, contents) {
    if (this.fileWithNameExists(filename)) {
      throw new Error("File with name " + filename + " already exists");
    }
    contents = contents || "";
    const id = "id" + this._data.nextFileId++;
    this._data.files[id] = {
      "id": id,
      "name": filename,
      "contents": contents,
    };
    return id;
  }
  renameFileWithId(id, newName) {
    const fileObject = this._getFileObjectWithId(id);
    fileObject.name = newName;
  }
  renameFileWithName(oldfilename, newfilename) {
    this.renameFileWithId(this.getIdFromName(oldfilename), newfilename);
  }
  getContentsOfFileWithId(id) {
    return this._getFileObjectWithId(id).contents;
  }
  getContentsOfFileWithName(name) {
    return this.getContentsOfFileWithId(this.getIdFromName(name));
  }
  setContentsOfFileWithId(id, contents) {
    const fileObject = this._getFileObjectWithId(id);
    fileObject.contents = contents;
  }
  setContentsOfFileWithName(name, contents) {
    this.setContentsOfFileWithId(this.getIdFromName(name), contents);
  }
  getCurrentFileId() {
    return this._data.currentFileId;
  }
  setCurrentFileId(id) {
    this._data.currentFileId = id;
  }
  setCurrentFileWithName(name) {
    this.setCurrentFileId(this.getIdFromName(name));
  }
  getCurrentFilename() {
    const id = this.getCurrentFileId();
    if (id === null) {
      return null;
    }
    return this.getNameFromId(id);
  }
  getProjectName() {
    return this._data.projectName;
  }
  setProjectName(name) {
    this._data.projectName = name;
  }
  getProjectId() {
    return this._data.projectId;
  }
  getFilenameContentPairs() {
    const pairs = [];
    for (const id in this._data.files) {
      const {name, contents} = this._data.files[id];
      pairs.push([name, contents]);
    }
    return pairs;
  }
  getCodeUriPairs() {
    return this.getFilenameContentPairs()
               .filter(args => args[0].endsWith(".xx"))
               .filter(args => !args[0].startsWith("_"))
               .map(args =>
                    [args[0] + " (" + this.getProjectName() + ")", args[1]])
               .map(args => [args[1], args[0]]);
  }
  getConfig() {
    if (this.fileWithNameExists("_config.json")) {
      try {
        return JSON.parse(this.getContentsOfFileWithName("_config.json"));
      } catch (e) {
        throw new Error(
            "Error while parsing _config.json for project " +
            this.getProjectName() + " -- " + e.toString());
      }
    } else {
      return {};
    }
  }
  getDirectDependencies() {
    if (this.fileWithNameExists("_config.json")) {
      const config = this.getConfig();
      if (config.dependencies) {
        return config.dependencies;
      } else {
        return {};
      }
    } else {
      return {};
    }
  }
}

ProjectData.prototype.asyncLoad = lib.asyncf(function*(projectId) {
  if (!projectId) {
    projectId = lib.generatePushID();
  }
  const user = firebase.auth().currentUser;
  if (!user) {
    throw new Error(
        "You can't initialize a project before user is authenticated");
  }
  this._data = yield lib.asyncReadFromFirebase(
      getProjectDataPath(projectId));
  if (this._data === null) {
    this._data = {
      "owners": Object.create(null),
      "projectId": projectId,
      "projectName": DEFAULT_PROJECT_NAME,
      "nextFileId": 1,
      "files": Object.create(null),
      "currentFileId": null,
    };
    this._data.owners[user.uid] = true;
    this._data.currentFileId = this.makeNewFile("_main.xx", DEFAULT_MAIN);
    this.makeNewFile("lib.xx", DEFAULT_LIB);
    this.makeNewFile("_config.json", DEFAULT_CONFIG);
    return false;
  } else {
    return true;
  }
});

ProjectData.prototype.asyncGetAllDependencies =
    lib.asyncf(function*(projectsLoadedSoFar) {
  projectsLoadedSoFar = projectsLoadedSoFar || Object.create(null);
  if (projectsLoadedSoFar[this.getProjectId()]) {
    return projectsLoadedSoFar;
  }
  projectsLoadedSoFar[this.getProjectId()] = this;
  for (const id in this.getDirectDependencies()) {
    if (!projectsLoadedSoFar[id]) {
      const pdata = new ProjectData();
      const didProjectLoad = yield pdata.asyncLoad(id);
      if (!didProjectLoad) {
        throw new Error("Invalid project id in dependency list: " + id);
      }
      yield pdata.asyncGetAllDependencies(projectsLoadedSoFar);
    }
  }
  return projectsLoadedSoFar;
});

ProjectData.prototype.asyncSave = lib.asyncf(function*() {
  const config = this.getConfig();
  if (config.public) {
    this._data.public = true;
  } else {
    this._data.public = false;
  }
  yield lib.asyncWriteToFirebase(
      getProjectDataPath(this._data.projectId), this._data);
});

exports.set("ProjectData", ProjectData);
exports.set("getProjectDataPath", getProjectDataPath);

})(lib);

