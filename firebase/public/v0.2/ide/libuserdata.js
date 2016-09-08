/* jshint esversion: 6 */

(function(exports) {
"use strict";

const USER_PATH_ROOT = "v0_2/users";

function getUserDataPath(userId) {
  if (!userId) {
    throw new Error("Invalid userId: " + userId);
  }
  return USER_PATH_ROOT + "/" + userId;
}

function getPathToMostRecentProjectId(userId) {
  return getUserDataPath(userId) + "/mostRecentProjectId";
}

function getPathToProjectInfos(userId) {
  return getUserDataPath(userId) + "/projects";
}

function getPathToProjectInfo(userId, projectId) {
  return getPathToProjectInfos(userId) + "/" + projectId;
}

function getPathToKeyMap(userId) {
  return getUserDataPath(userId) + "/keyMap";
}

class UserData {
  constructor(userId) {
    if (!userId) {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error(
            "You can't initialize user data before user is authenticated");
      }
      userId = user.uid;
    }
    this._userId = userId;
  }
  deleteProjectInfo(id) {
    lib.deleteFromFirebase(getPathToProjectInfo(this._userId, id));
  }
}

UserData.prototype.asyncGetMostRecentProjectId = lib.asyncf(function*() {
  const userId = this._userId;
  return yield lib.asyncReadFromFirebase(
      getPathToMostRecentProjectId(userId));
});

UserData.prototype.asyncGetProjectInfos = lib.asyncf(function*() {
  const userId = this._userId;
  const infosObject =
      yield lib.asyncReadFromFirebase(getPathToProjectInfos(userId));
  if (infosObject === null) {
    return [];
  }
  const infos = [];
  for (const key in infosObject) {
    infos.push(infosObject[key]);
  }
  return infos;
});

UserData.prototype.asyncSetMostRecentProjectId = lib.asyncf(function*(id) {
  yield lib.asyncWriteToFirebase(
      getPathToMostRecentProjectId(this._userId), id);
});

UserData.prototype.asyncSetProjectInfo = lib.asyncf(function*(id, info) {
  yield lib.asyncWriteToFirebase(
      getPathToProjectInfo(this._userId, id), info);
});

UserData.prototype.asyncSetKeyMap = lib.asyncf(function*(mode) {
  yield lib.asyncWriteToFirebase(getPathToKeyMap(this._userId), mode);
});

UserData.prototype.asyncGetKeyMap = lib.asyncf(function*(mode) {
  return yield lib.asyncReadFromFirebase(getPathToKeyMap(this._userId));
});

exports.set("UserData", UserData);

})(lib);

